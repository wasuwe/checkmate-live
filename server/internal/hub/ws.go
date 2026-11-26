package hub

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

const (
	readLimit    = 4096
	writeTimeout = 5 * time.Second
	pingInterval = 30 * time.Second
	pingTimeout  = 10 * time.Second
)

// ServeWS รับ connection WebSocket หนึ่งเส้น
// ลำดับ: auth (ข้อความแรก ภายใน AuthTimeout) → join → move / resign ...
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
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

	client := newClient(userID, cancel)
	go writePump(ctx, conn, client)
	client.Send(mustJSON(authOKMsg{Type: "auth_ok", UserID: userID}))

	var room *Room
	defer func() {
		if room != nil {
			room.post(event{kind: evLeave, client: client})
		}
	}()

	for {
		msg, err := readInbound(ctx, conn)
		if errors.Is(err, errBadMessage) {
			client.Send(encodeError(errCodeBadMessage))
			continue
		}
		if err != nil {
			return
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

		default: // auth ซ้ำ หรือชนิดที่ไม่ควรมาตอนนี้
			client.Send(encodeError(errCodeBadMessage))
		}
	}
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
