package hub

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/time/rate"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

const (
	readLimit    = 4096
	writeTimeout = 5 * time.Second
	pingInterval = 30 * time.Second
	pingTimeout  = 10 * time.Second
	// profileTimeout คือเวลาที่รอฐานข้อมูลตอนหาชื่อผู้เล่น
	profileTimeout = 2 * time.Second
	// maxRateStrikes คือจำนวนครั้งที่ connection ส่งเกินโควตาได้ก่อนถูกตัด
	maxRateStrikes = 30
)

// ServeWS รับ connection WebSocket หนึ่งเส้น
// ลำดับ: auth (ข้อความแรก ภายใน AuthTimeout) → join → move / resign ...
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	// จำกัดก่อน upgrade: connection ที่ยังไม่ได้ auth ก็นับ จึงเปิดค้างจำนวนมากจาก IP เดียวไม่ได้
	ip := h.cfg.ClientIP(r)
	if !h.ipConns.Acquire(ip) {
		w.Header().Set("Retry-After", "10")
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}
	defer h.ipConns.Release(ip)

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.cfg.OriginPatterns,
	})
	if err != nil {
		return // Accept เขียน response ให้แล้ว
	}
	defer func() { _ = conn.CloseNow() }()
	conn.SetReadLimit(readLimit)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	userID, ok := h.authenticate(ctx, conn)
	if !ok {
		return
	}

	if !h.userConns.Acquire(userID) {
		writeCtx, cancelWrite := context.WithTimeout(ctx, writeTimeout)
		_ = conn.Write(writeCtx, websocket.MessageText, encodeError(errCodeTooManyConnections))
		cancelWrite()
		_ = conn.Close(websocket.StatusPolicyViolation, "too many connections")
		return
	}
	defer h.userConns.Release(userID)

	client := newClient(userID, cancel)
	client.Profile = h.lookupProfile(ctx, userID)
	go writePump(ctx, conn, client)
	client.Send(mustJSON(authOKMsg{Type: "auth_ok", UserID: userID}))

	var room *Room
	defer func() {
		if room != nil {
			room.post(event{kind: evLeave, client: client})
		}
	}()

	limiter := rate.NewLimiter(rate.Every(h.cfg.MessageRate.Every), h.cfg.MessageRate.Burst)
	strikes := 0

	for {
		msg, err := readInbound(ctx, conn)
		if err != nil && !errors.Is(err, errBadMessage) {
			return
		}
		// ข้อความที่เกินโควตาถูกทิ้ง (รวมข้อความที่ผิดรูปแบบ) ถ้ายังส่งรัวไม่หยุดจะถูกตัดการเชื่อมต่อ
		if !limiter.Allow() {
			if strikes++; strikes > maxRateStrikes {
				_ = conn.Close(websocket.StatusPolicyViolation, "rate limit exceeded")
				return
			}
			client.Send(encodeError(errCodeRateLimited))
			continue
		}
		if errors.Is(err, errBadMessage) {
			client.Send(encodeError(errCodeBadMessage))
			continue
		}

		switch msg.Type {
		case msgJoin:
			if room != nil {
				client.Send(encodeError(errCodeAlreadyJoined))
				continue
			}
			target := h.room(msg.Room)
			if target == nil || !target.post(event{kind: evJoin, client: client}) {
				client.Send(encodeError(errCodeRoomNotFound))
				continue
			}
			room = target

		case msgMove:
			if room == nil {
				client.Send(encodeError(errCodeNotJoined))
				continue
			}
			room.post(event{
				kind:   evMove,
				client: client,
				ply:    *msg.Ply,
				move:   game.Move{From: msg.From, To: msg.To, Promo: msg.Promo},
			})

		case msgResign:
			if room == nil {
				client.Send(encodeError(errCodeNotJoined))
				continue
			}
			room.post(event{kind: evResign, client: client})

		case msgChat:
			if room == nil {
				client.Send(encodeError(errCodeNotJoined))
				continue
			}
			room.post(event{kind: evChat, client: client, text: msg.Text})

		case msgReport:
			if room == nil {
				client.Send(encodeError(errCodeNotJoined))
				continue
			}
			room.post(event{kind: evReport, client: client, id: *msg.ID})

		default: // auth ซ้ำ หรือชนิดที่ไม่ควรมาตอนนี้
			client.Send(encodeError(errCodeBadMessage))
		}
	}
}

// lookupProfile หาชื่อและรูปของผู้ใช้ ถ้าหาไม่ได้ทันเวลาก็เล่นต่อได้โดยไม่มีชื่อ
func (h *Hub) lookupProfile(ctx context.Context, userID string) PlayerProfile {
	if h.cfg.Profiles == nil {
		return PlayerProfile{}
	}
	lookupCtx, cancel := context.WithTimeout(ctx, profileTimeout)
	defer cancel()
	return h.cfg.Profiles(lookupCtx, userID)
}

// authenticate รอข้อความ auth เป็นข้อความแรก ถ้าไม่มาทันเวลาหรือ token ไม่ผ่านจะตัดการเชื่อมต่อ
func (h *Hub) authenticate(ctx context.Context, conn *websocket.Conn) (string, bool) {
	authCtx, cancel := context.WithTimeout(ctx, h.cfg.AuthTimeout)
	defer cancel()

	msg, err := readInbound(authCtx, conn)
	if err != nil || msg.Type != msgAuth {
		_ = conn.Close(websocket.StatusPolicyViolation, "auth required")
		return "", false
	}
	userID, err := h.auth.Authenticate(authCtx, msg.Token)
	if err != nil {
		writeCtx, cancelWrite := context.WithTimeout(ctx, writeTimeout)
		_ = conn.Write(writeCtx, websocket.MessageText, encodeError(errCodeUnauthorized))
		cancelWrite()
		_ = conn.Close(websocket.StatusPolicyViolation, "unauthorized")
		return "", false
	}
	return userID, true
}

func readInbound(ctx context.Context, conn *websocket.Conn) (inbound, error) {
	typ, data, err := conn.Read(ctx)
	if err != nil {
		return inbound{}, err
	}
	if typ != websocket.MessageText {
		return inbound{}, errBadMessage
	}
	return decodeInbound(data)
}

// writePump เป็น goroutine เดียวที่เขียนลง connection และส่ง ping เพื่อตัด connection ที่ค้าง
func writePump(ctx context.Context, conn *websocket.Conn, c *Client) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case b := <-c.send:
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Write(writeCtx, websocket.MessageText, b)
			cancel()
			if err != nil {
				c.Kick()
				return
			}
		case <-ticker.C:
			pingCtx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := conn.Ping(pingCtx)
			cancel()
			if err != nil {
				c.Kick()
				return
			}
		}
	}
}
