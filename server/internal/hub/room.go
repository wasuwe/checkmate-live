package hub

import (
	"errors"
	"math"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

type eventKind int

const (
	evJoin eventKind = iota
	evLeave
	evMove
	evResign
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
	// abandonAt คือเส้นตายของผู้เล่นที่หลุดระหว่างเกม ถ้าไม่กลับมาทันจะแพ้ด้วยเหตุ abandon
	abandonAt map[game.Color]time.Time
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
		abandonAt:  map[game.Color]time.Time{},
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
	// ระหว่างเล่น: ตื่นเมื่อผู้เล่นที่หลุดครบเวลาผ่อนผัน
	if color, ok := r.firstAbandon(); ok {
		return r.abandonAt[color], true
	}
	// ห้องที่ไม่มีใครอยู่และไม่ได้กำลังเล่น จะถูกลบเมื่อว่างครบ IdleTTL
	if len(r.clients) == 0 && r.status != StatusPlaying {
		return r.emptySince.Add(r.cfg.IdleTTL), true
	}
	return time.Time{}, false
}

// firstAbandon คืนสีของผู้เล่นที่หลุดและเส้นตายมาถึงก่อน
func (r *Room) firstAbandon() (game.Color, bool) {
	var first game.Color
	found := false
	for _, color := range []game.Color{game.White, game.Black} {
		at, ok := r.abandonAt[color]
		if ok && (!found || at.Before(r.abandonAt[first])) {
			first, found = color, true
		}
	}
	return first, found
}

// onTimer คืน true ถ้าห้องควรปิด
func (r *Room) onTimer(now time.Time) bool {
	// ถ้าหลุดทั้งคู่ คนที่หลุดก่อนเป็นฝ่ายแพ้
	if color, ok := r.firstAbandon(); ok && !now.Before(r.abandonAt[color]) {
		r.game.Forfeit(color, game.ReasonAbandon)
		r.finish()
		return false
	}
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
	case evResign:
		r.handleResign(ev.client)
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
	if color, ok := r.colorOf(c.UserID); ok {
		delete(r.abandonAt, color) // กลับมาทันเวลา ยกเลิกการนับถอยหลัง
	}
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
	now := time.Now()
	if len(r.clients) == 0 {
		r.emptySince = now
	}
	// ผู้เล่นปิดทุกแท็บระหว่างเกม: เริ่มนับถอยหลัง ถ้ายังมีแท็บอื่นเปิดอยู่ถือว่ายังอยู่
	if color, ok := r.colorOf(c.UserID); ok && r.status == StatusPlaying && !r.connected(c.UserID) {
		r.abandonAt[color] = now.Add(r.cfg.AbandonGrace)
	}
	r.broadcastState()
}

// handleResign ให้ผู้ส่งยอมแพ้ ผู้แพ้ตัดสินจากตัวตนของ connection เท่านั้น
// ถ้าไม่ใช่ผู้เล่นหรือเกมไม่ได้กำลังเล่น (เช่น กดซ้ำ) จะไม่ทำอะไร
func (r *Room) handleResign(c *Client) {
	color, ok := r.colorOf(c.UserID)
	if !ok || r.status != StatusPlaying {
		return
	}
	r.game.Resign(color)
	r.finish()
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
	clear(r.abandonAt)
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
			info := &playerInfo{Connected: r.connected(id)}
			if at, ok := r.abandonAt[color]; ok {
				// ปัดขึ้น เพื่อไม่ให้ client เห็น 0 ทั้งที่ยังเหลือเวลา
				info.GraceLeft = max(1, int(math.Ceil(time.Until(at).Seconds())))
			}
			base.Players[color] = info
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
