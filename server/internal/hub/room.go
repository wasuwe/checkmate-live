package hub

import (
	"errors"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

type eventKind int

const (
	evJoin eventKind = iota
	evLeave
	evMove
)

// event คือสิ่งที่ส่งเข้า goroutine ของห้อง
type event struct {
	kind   eventKind
	client *Client
	ply    int
	move   game.Move
}

// Room คือห้องเกมหนึ่งห้อง state ทั้งหมดถูกแตะจาก goroutine เดียว (run)
// จึงไม่ต้องใช้ mutex ทุกอย่างจากภายนอกเข้ามาทาง inbox เท่านั้น
type Room struct {
	id      string
	cfg     Config
	inbox   chan event
	done    chan struct{}
	onClose func(id string)

	// ---- ด้านล่างนี้เป็นของ goroutine run เท่านั้น ----
	game       *game.Game
	status     Status
	pending    string                // user ID ของผู้เล่นคนแรกที่รอคู่ (ช่วง waiting)
	players    map[game.Color]string // สี → user ID (หลังเริ่มเกม)
	clients    map[*Client]struct{}
	emptySince time.Time // เวลาที่ห้องเริ่มว่าง (zero = มีคนอยู่)
}

func newRoom(id string, cfg Config, onClose func(string)) *Room {
	return &Room{
		id:         id,
		cfg:        cfg,
		inbox:      make(chan event, 64),
		done:       make(chan struct{}),
		onClose:    onClose,
		game:       game.New(),
		status:     StatusWaiting,
		players:    map[game.Color]string{},
		clients:    map[*Client]struct{}{},
		emptySince: time.Now(),
	}
}

// post ส่ง event เข้าห้อง คืน false ถ้าห้องปิดไปแล้ว
func (r *Room) post(ev event) bool {
	// เช็ก done ก่อน เพราะ select สุ่มเลือกเมื่อพร้อมทั้งสองทาง และ inbox มี buffer
	select {
	case <-r.done:
		return false
	default:
	}
	select {
	case r.inbox <- ev:
		return true
	case <-r.done:
		return false
	}
}

// run คือ game loop ของห้อง ทำงานจนห้องถูกปิด
func (r *Room) run(stop <-chan struct{}) {
	defer r.shutdown()

	for {
		var timerC <-chan time.Time
		var timer *time.Timer
		if next, ok := r.nextDeadline(); ok {
			timer = time.NewTimer(time.Until(next))
			timerC = timer.C
		}

		select {
		case ev := <-r.inbox:
			r.handle(ev)
		case <-timerC:
			if r.onTimer(time.Now()) {
				return
			}
		case <-stop:
			if timer != nil {
				timer.Stop()
			}
			return
		}
		if timer != nil {
			timer.Stop()
		}
	}
}

func (r *Room) shutdown() {
	close(r.done)
	for c := range r.clients {
		c.Kick()
	}
	r.onClose(r.id)
}

// nextDeadline คืนเวลาที่ห้องต้องตื่นมาทำงานครั้งถัดไป
func (r *Room) nextDeadline() (time.Time, bool) {
	// ห้องที่ไม่มีใครอยู่และไม่ได้กำลังเล่น จะถูกลบเมื่อว่างครบ IdleTTL
	if len(r.clients) == 0 && r.status != StatusPlaying {
		return r.emptySince.Add(r.cfg.IdleTTL), true
	}
	return time.Time{}, false
}

// onTimer คืน true ถ้าห้องควรปิด
func (r *Room) onTimer(now time.Time) bool {
	if len(r.clients) == 0 && r.status != StatusPlaying && !now.Before(r.emptySince.Add(r.cfg.IdleTTL)) {
		return true
	}
	return false
}

func (r *Room) handle(ev event) {
	switch ev.kind {
	case evJoin:
		r.handleJoin(ev.client)
	case evLeave:
		r.handleLeave(ev.client)
	case evMove:
		r.handleMove(ev.client, ev.ply, ev.move)
	}
}

func (r *Room) handleJoin(c *Client) {
	r.clients[c] = struct{}{}
	r.emptySince = time.Time{}

	if r.status == StatusWaiting && !r.isSeated(c.UserID) {
		if r.pending == "" {
			r.pending = c.UserID
		} else {
			r.start(r.pending, c.UserID)
		}
	}
	// ที่นั่งผูกกับ user ID ไม่ใช่ connection: คนเดิมเข้ามาใหม่ได้ที่นั่งเดิม
	// ส่วนคนที่ 3 เป็นต้นไปเป็นคนดู
	r.broadcastState()
}

// start สุ่มสีให้ผู้เล่นสองคนแล้วเริ่มเกม
func (r *Room) start(a, b string) {
	if r.cfg.CoinFlip() {
		a, b = b, a
	}
	r.players[game.White] = a
	r.players[game.Black] = b
	r.pending = ""
	r.status = StatusPlaying
}

func (r *Room) handleLeave(c *Client) {
	if _, ok := r.clients[c]; !ok {
		return
	}
	delete(r.clients, c)
	if len(r.clients) == 0 {
		r.emptySince = time.Now()
	}
	r.broadcastState()
}

func (r *Room) handleMove(c *Client, ply int, m game.Move) {
	// ลำดับการตรวจ: เกมยังเล่นอยู่ → เป็นผู้เล่น → ถึงตา → ไม่ใช่ตาเดินเก่า → ถูกกติกา
	if r.status != StatusPlaying {
		c.Send(encodeError(errCodeGameNotActive))
		return
	}
	color, ok := r.colorOf(c.UserID)
	if !ok {
		c.Send(encodeError(errCodeNotAPlayer))
		return
	}
	if r.game.Turn() != color {
		c.Send(encodeError(errCodeNotYourTurn))
		return
	}
	if ply != r.game.Ply() {
		c.Send(encodeError(errCodeStaleMove))
		return
	}
	if err := r.game.Move(m); err != nil {
		code := errCodeIllegalMove
		if errors.Is(err, game.ErrGameOver) {
			code = errCodeGameNotActive
		}
		c.Send(encodeError(code))
		return
	}

	if r.game.Over() {
		r.finish()
		return
	}
	r.broadcastState()
}

// finish ปิดเกมและแจ้งผลทั้งห้อง เรียกหลังจาก r.game จบแล้วเท่านั้น
func (r *Room) finish() {
	r.status = StatusFinished
	result, reason := r.game.Result()
	over := mustJSON(gameOverMsg{Type: "game_over", Result: result, Reason: reason})
	for c := range r.clients {
		c.Send(over)
	}
	r.broadcastState()
}

func (r *Room) isSeated(userID string) bool {
	if r.pending == userID {
		return true
	}
	_, ok := r.colorOf(userID)
	return ok
}

func (r *Room) colorOf(userID string) (game.Color, bool) {
	for color, id := range r.players {
		if id == userID {
			return color, true
		}
	}
	return "", false
}

func (r *Room) connected(userID string) bool {
	for c := range r.clients {
		if c.UserID == userID {
			return true
		}
	}
	return false
}

// broadcastState ส่ง state ให้ทุกคนในห้อง แต่ละคนได้ field "you" ของตัวเอง
func (r *Room) broadcastState() {
	base := stateMsg{
		Type:   "state",
		Room:   r.id,
		Status: r.status,
		FEN:    r.game.FEN(),
		Turn:   r.game.Turn(),
		Ply:    r.game.Ply(),
	}
	if lm := r.game.LastMove(); lm != nil {
		base.LastMove = &moveInfo{From: lm.From, To: lm.To}
	}
	if r.status != StatusWaiting {
		base.Players = map[game.Color]*playerInfo{}
		for color, id := range r.players {
			base.Players[color] = &playerInfo{Connected: r.connected(id)}
		}
	}
	base.Result, base.Reason = r.game.Result()

	// ผู้ใช้คนเดียวกันได้ข้อความเหมือนกัน จึง encode ครั้งเดียวต่อ user
	encoded := map[string][]byte{}
	for c := range r.clients {
		b, ok := encoded[c.UserID]
		if !ok {
			msg := base
			msg.You = r.youInfo(c.UserID)
			b = mustJSON(msg)
			encoded[c.UserID] = b
		}
		c.Send(b)
	}
}

func (r *Room) youInfo(userID string) youInfo {
	if color, ok := r.colorOf(userID); ok {
		return youInfo{Role: rolePlayer, Color: color}
	}
	if r.pending == userID {
		return youInfo{Role: rolePlayer}
	}
	return youInfo{Role: roleSpectator}
}
