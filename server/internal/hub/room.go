package hub

import (
	"errors"
	"math"
	"slices"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/game"
)

type eventKind int

const (
	evJoin eventKind = iota
	evLeave
	evMove
	evResign
	evChat
	evReport
	evReady
	evKick
	evSet
)

// event คือสิ่งที่ส่งเข้า goroutine ของห้อง
type event struct {
	kind   eventKind
	client *Client
	ply    int
	move   game.Move
	text   string
	id     int  // รหัสข้อความแชท (evReport)
	ready  bool // พร้อมหรือไม่ (evReady)
}

// Room คือห้องเกมหนึ่งห้อง state ทั้งหมดถูกแตะจาก goroutine เดียว (run)
// จึงไม่ต้องใช้ mutex ทุกอย่างจากภายนอกเข้ามาทาง inbox เท่านั้น
type Room struct {
	id        string
	createdBy string
	cfg       Config
	inbox     chan event
	done      chan struct{}
	onClose   func(id string)
	// onFinish ถูกเรียกครั้งเดียวเมื่อเกมจบ (อาจเป็น nil)
	onFinish func(id string)
	// activity คือภาพล่าสุดของผู้เล่นในห้อง ให้ goroutine อื่นอ่านได้โดยไม่ต้องรอห้อง (ดู publishActivity)
	activity atomic.Pointer[map[string]Activity]

	// ---- ด้านล่างนี้เป็นของ goroutine run เท่านั้น ----
	game   game.Engine
	status Status
	// seats คือ user ID ของผู้เล่นที่นั่งรออยู่ (ช่วง waiting) สูงสุด 2 คน ตามลำดับที่เข้ามา
	seats []string
	// ready คือผู้เล่นที่กดพร้อมแล้ว และ startAt คือเวลาที่เกมจะเริ่มเมื่อทุกคนพร้อม (zero = ยังไม่นับถอยหลัง)
	ready   map[string]bool
	startAt time.Time
	// removed คือผู้ใช้ที่เจ้าของห้องให้ออกจากที่นั่ง กลับมานั่งในห้องนี้ไม่ได้ (เป็นผู้ชมได้)
	// เก็บในหน่วยความจำเท่านั้น ถ้าเซิร์ฟเวอร์เริ่มใหม่ระหว่างรอ รายชื่อนี้หายไป
	removed map[string]bool
	// sets คือรหัสชุดหมากรุกที่ผู้เล่นแต่ละคนเลือกในห้องรอ (user ID → รหัส) เลือกได้เฉพาะก่อนเกมเริ่ม
	sets    map[string]string
	players map[game.Color]string // สี → user ID (หลังเริ่มเกม)
	clients map[*Client]struct{}
	// profiles คือชื่อและรูปล่าสุดของผู้ใช้ที่เคยเข้าห้อง (user ID → โปรไฟล์)
	profiles   map[string]PlayerProfile
	emptySince time.Time // เวลาที่ห้องเริ่มว่าง (zero = มีคนอยู่)
	startedAt  time.Time // เวลาที่เกมเริ่ม
	// closeAt คือเวลาที่ห้องซึ่งเกมจบแล้วจะปิดเอง (zero = เกมยังไม่จบ)
	closeAt time.Time
	// abandonAt คือเส้นตายของผู้เล่นที่หลุดระหว่างเกม ถ้าไม่กลับมาทันจะแพ้ด้วยเหตุ abandon
	abandonAt map[game.Color]time.Time
	clock     *clock

	chat         []chatEntry
	chatSeq      int
	chatLimiters map[string]*rate.Limiter // ต่อ user ID ไม่ใช่ต่อ connection เปิดหลายแท็บก็ไม่ได้โควตาเพิ่ม
	// chatSenders ให้เลขประจำตัวในห้องแก่ผู้ส่งแชท (user ID → เลข) เพื่อให้ฝั่งเว็บซ่อนข้อความของคนเดียวกันได้
	// โดยไม่ต้องรู้ user ID จริง
	chatSenders    map[string]int
	reportLimiters map[string]*rate.Limiter
	reported       map[reportKey]struct{}
}

func newRoom(id string, cfg Config, variant game.Variant, tc TimeControl, createdBy string, onClose func(string)) *Room {
	if tc.Initial <= 0 && !tc.Unlimited {
		tc = DefaultTimeControl
	}
	return &Room{
		id:         id,
		createdBy:  createdBy,
		cfg:        cfg,
		inbox:      make(chan event, 64),
		done:       make(chan struct{}),
		onClose:    onClose,
		game:       game.NewVariant(variant),
		status:     StatusWaiting,
		players:    map[game.Color]string{},
		ready:      map[string]bool{},
		removed:    map[string]bool{},
		sets:       map[string]string{},
		clients:    map[*Client]struct{}{},
		profiles:   map[string]PlayerProfile{},
		emptySince: time.Now(),
		abandonAt:  map[game.Color]time.Time{},
		clock:      newClock(tc),

		chatLimiters:   map[string]*rate.Limiter{},
		chatSenders:    map[string]int{},
		reportLimiters: map[string]*rate.Limiter{},
		reported:       map[reportKey]struct{}{},
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
	// expired = ห้องปิดเองเพราะว่างนาน จึงลบออกจากที่เก็บถาวรด้วย
	// ถ้าปิดเพราะเซิร์ฟเวอร์หยุด ต้องเก็บไว้เพื่อกู้คืนตอนเริ่มใหม่
	expired := false
	defer func() { r.shutdown(expired) }()

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
				expired = true
				return
			}
		case <-stop:
			if timer != nil {
				timer.Stop()
			}
			// เซิร์ฟเวอร์กำลังหยุด: บันทึกสถานะล่าสุด (รวมเวลาบนนาฬิกา ณ ตอนนี้) ไว้กู้คืน
			if r.status != StatusFinished {
				r.persist()
			}
			return
		}
		if timer != nil {
			timer.Stop()
		}
	}
}

func (r *Room) shutdown(expired bool) {
	if expired && r.cfg.Store != nil {
		r.cfg.Store.DeleteRoom(r.id)
	}
	close(r.done)
	for c := range r.clients {
		c.Kick()
	}
	r.onClose(r.id)
}

// nextDeadline คืนเวลาที่ห้องต้องตื่นมาทำงานครั้งถัดไป
func (r *Room) nextDeadline() (time.Time, bool) {
	// ห้องรอที่ทุกคนพร้อมแล้ว: ตื่นเมื่อนับถอยหลังครบ
	if r.status == StatusWaiting && !r.startAt.IsZero() {
		return r.startAt, true
	}
	// ระหว่างเล่น: ตื่นเมื่อมีคนหมดเวลา หรือผู้เล่นที่หลุดครบเวลาผ่อนผัน แล้วแต่อย่างไหนถึงก่อน
	flag, flagging := r.clock.flagAt()
	if color, ok := r.firstAbandon(); ok {
		if at := r.abandonAt[color]; !flagging || at.Before(flag) {
			return at, true
		}
	}
	if flagging {
		return flag, true
	}
	// ห้องที่ไม่มีใครอยู่และไม่ได้กำลังเล่น จะถูกลบเมื่อว่างครบ IdleTTL
	// ห้องที่เกมจบแล้วปิดเมื่อครบ FinishedTTL แม้ยังมีคนอยู่ (แล้วแต่อย่างไหนถึงก่อน)
	if len(r.clients) == 0 && r.status != StatusPlaying {
		idle := r.emptySince.Add(r.cfg.IdleTTL)
		if !r.closeAt.IsZero() && r.closeAt.Before(idle) {
			return r.closeAt, true
		}
		return idle, true
	}
	if !r.closeAt.IsZero() {
		return r.closeAt, true
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
	if r.status == StatusWaiting && !r.startAt.IsZero() {
		if !now.Before(r.startAt) {
			r.begin()
		}
		return false
	}
	if r.flagIfOutOfTime(now) {
		return false
	}
	// ถ้าหลุดทั้งคู่ คนที่หลุดก่อนเป็นฝ่ายแพ้
	// ถ้าเส้นตายตรงกันพอดี (ห้องที่กู้คืนหลังรีสตาร์ต) ฝั่งที่ถึงตาเดินเป็นฝ่ายแพ้
	if color, ok := r.firstAbandon(); ok && !now.Before(r.abandonAt[color]) {
		if other, both := r.abandonAt[color.Other()]; both && other.Equal(r.abandonAt[color]) {
			color = r.game.Turn()
		}
		r.game.Forfeit(color, game.ReasonAbandon)
		r.finish()
		return false
	}
	if len(r.clients) == 0 && r.status != StatusPlaying && !now.Before(r.emptySince.Add(r.cfg.IdleTTL)) {
		return true
	}
	// เกมจบมาครบเวลาแล้ว: ปิดห้อง (หน้าเว็บของคนที่ยังอยู่เล่นภาพปิดม่านเองจากเวลาที่ส่งไปใน state)
	if !r.closeAt.IsZero() && !now.Before(r.closeAt) {
		return true
	}
	return false
}

// flagIfOutOfTime ปรับแพ้ฝั่งที่กำลังเดินถ้าเวลาหมดแล้ว คืน true ถ้าเกมจบด้วยเหตุนี้
func (r *Room) flagIfOutOfTime(now time.Time) bool {
	flag, ok := r.clock.flagAt()
	if !ok || now.Before(flag) {
		return false
	}
	r.game.Forfeit(r.clock.running, game.ReasonTimeout)
	r.finish()
	return true
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
	case evChat:
		r.handleChat(ev.client, ev.text)
	case evReport:
		r.handleReport(ev.client, ev.id)
	case evReady:
		r.handleReady(ev.client, ev.ready)
	case evKick:
		r.handleKick(ev.client)
	case evSet:
		r.handleSet(ev.client, ev.text)
	}
}

func (r *Room) handleJoin(c *Client) {
	r.clients[c] = struct{}{}
	r.emptySince = time.Time{}
	r.profiles[c.UserID] = c.Profile // connection ล่าสุดมีข้อมูลใหม่สุด

	if r.status == StatusWaiting && !r.isSeated(c.UserID) && !r.removed[c.UserID] && r.takeSeat(c.UserID) {
		// ไม่ใช้ห้องรอ: เกมเริ่มทันทีที่มีครบสองคน
		if !r.cfg.Lobby && len(r.seats) == 2 {
			r.start(r.seats[0], r.seats[1])
		}
		r.persist()
	}
	// ที่นั่งผูกกับ user ID ไม่ใช่ connection: คนเดิมเข้ามาใหม่ได้ที่นั่งเดิม
	// ส่วนคนที่ 3 เป็นต้นไปเป็นคนดู
	if color, ok := r.colorOf(c.UserID); ok {
		delete(r.abandonAt, color) // กลับมาทันเวลา ยกเลิกการนับถอยหลัง
	}
	r.sendChatHistory(c)
	r.broadcastState()
}

// start สุ่มสีให้ผู้เล่นสองคนแล้วเริ่มเกม
func (r *Room) start(a, b string) {
	if r.cfg.CoinFlip() {
		a, b = b, a
	}
	r.players[game.White] = a
	r.players[game.Black] = b
	r.seats = nil
	clear(r.ready)
	r.startAt = time.Time{}
	r.status = StatusPlaying
	r.startedAt = time.Now()
	r.clock.start(game.White, r.startedAt.Add(r.cfg.StartDelay))
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
	// ออกจากห้องรอ: ถือว่าไม่พร้อม และหยุดนับถอยหลัง (ที่นั่งยังอยู่จนกว่าจะมีคนอื่นมานั่งแทน)
	if r.status == StatusWaiting && r.ready[c.UserID] && !r.connected(c.UserID) {
		delete(r.ready, c.UserID)
		r.updateCountdown(now)
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
	// ตาเดินที่มาถึงหลังเวลาหมดไม่ถูกนับ แม้ timer ของห้องจะยังไม่ทันทำงาน
	now := time.Now()
	if r.flagIfOutOfTime(now) {
		return
	}
	mover := r.game.Turn()
	if err := r.game.Move(m); err != nil {
		code := errCodeIllegalMove
		if errors.Is(err, game.ErrGameOver) {
			code = errCodeGameNotActive
		}
		c.Send(encodeError(code))
		return
	}
	// เกมที่กินหลายต่อได้ (หมากฮอส) ตายังเป็นของฝ่ายเดิมจนกว่าจะกินจบ นาฬิกาจึงยังไม่สลับ
	if r.game.Over() || r.game.Turn() != mover {
		r.clock.press(now)
	}

	if r.game.Over() {
		r.finish()
		return
	}
	r.persist()
	r.broadcastState()
}

// finish ปิดเกมและแจ้งผลทั้งห้อง เรียกหลังจาก r.game จบแล้วเท่านั้น
func (r *Room) finish() {
	now := time.Now()
	r.status = StatusFinished
	r.closeAt = now.Add(r.cfg.FinishedTTL)
	r.clock.stop(now)
	clear(r.abandonAt)
	r.persistGame(now)
	r.persist()
	if r.onFinish != nil {
		r.onFinish(r.id)
	}
	result, reason := r.game.Result()
	over := mustJSON(gameOverMsg{Type: "game_over", Result: result, Reason: reason})
	for c := range r.clients {
		c.Send(over)
	}
	r.broadcastState()
}

func (r *Room) isSeated(userID string) bool {
	if slices.Contains(r.seats, userID) {
		return true
	}
	_, ok := r.colorOf(userID)
	return ok
}

// takeSeat ให้ที่นั่งในห้องรอแก่ผู้ใช้ คืน false ถ้าไม่มีที่ (ผู้ใช้เป็นผู้ชม)
// ถ้าที่นั่งเต็มแต่เจ้าของที่นั่งคนหนึ่งไม่ได้เชื่อมต่ออยู่ ที่นั่งนั้นถูกยกให้คนใหม่
func (r *Room) takeSeat(userID string) bool {
	if len(r.seats) < 2 {
		r.seats = append(r.seats, userID)
		return true
	}
	for i, holder := range r.seats {
		if !r.connected(holder) {
			delete(r.ready, holder)
			r.seats[i] = userID
			return true
		}
	}
	return false
}

// handleReady ตั้งว่าผู้เล่นในห้องรอพร้อมหรือยัง ผู้ชมและห้องที่เริ่มเกมแล้วไม่มีผล
func (r *Room) handleReady(c *Client, ready bool) {
	if r.status != StatusWaiting || !r.cfg.Lobby || !slices.Contains(r.seats, c.UserID) {
		return
	}
	if ready {
		r.ready[c.UserID] = true
	} else {
		delete(r.ready, c.UserID)
	}
	r.updateCountdown(time.Now())
	if r.status == StatusWaiting {
		r.broadcastState()
	}
}

// handleSet จำชุดหมากรุกที่ผู้เล่นเลือก รับเฉพาะจากผู้เล่นที่นั่งอยู่และเฉพาะก่อนเกมเริ่ม
// (เจ้าของโปรเจกต์กำหนด: เลือกชุดได้ตอนเข้าห้องเท่านั้น ระหว่างเกมเปลี่ยนไม่ได้)
func (r *Room) handleSet(c *Client, set string) {
	if r.status != StatusWaiting || !slices.Contains(r.seats, c.UserID) || r.sets[c.UserID] == set {
		return
	}
	r.sets[c.UserID] = set
	r.persist()
}

// hostID คือเจ้าของห้องในห้องรอ: ผู้สร้างห้องถ้านั่งอยู่ ไม่งั้นคือคนที่นั่งก่อน ("" ถ้ายังไม่มีใครนั่ง)
func (r *Room) hostID() string {
	if r.createdBy != "" && slices.Contains(r.seats, r.createdBy) {
		return r.createdBy
	}
	if len(r.seats) > 0 {
		return r.seats[0]
	}
	return ""
}

// handleKick ให้ผู้เล่นอีกคนออกจากที่นั่งในห้องรอ ทำได้เฉพาะเจ้าของห้อง และเฉพาะก่อนเกมเริ่ม
// คนที่ถูกให้ออกยังอยู่ในห้องเป็นผู้ชมได้ แต่กลับมานั่งในห้องนี้ไม่ได้ ที่นั่งจึงว่างให้คนที่เจ้าของห้องเชิญจริง
func (r *Room) handleKick(c *Client) {
	if r.status != StatusWaiting || !r.cfg.Lobby || len(r.seats) < 2 || c.UserID != r.hostID() {
		return
	}
	for i, id := range r.seats {
		if id != c.UserID {
			r.seats = slices.Delete(r.seats, i, i+1)
			delete(r.ready, id)
			r.removed[id] = true
			break
		}
	}
	r.updateCountdown(time.Now())
	r.persist()
	r.broadcastState()
}

// updateCountdown เริ่มหรือหยุดการนับถอยหลังตามว่าทุกคนพร้อมหรือไม่ ถ้าไม่ต้องนับ เกมเริ่มทันที
func (r *Room) updateCountdown(now time.Time) {
	all := len(r.seats) == 2
	for _, id := range r.seats {
		all = all && r.ready[id] && r.connected(id)
	}
	switch {
	case !all:
		r.startAt = time.Time{}
	case r.cfg.LobbyCountdown < 0:
		r.begin()
	case r.startAt.IsZero():
		r.startAt = now.Add(r.cfg.LobbyCountdown)
	}
}

// begin เริ่มเกมด้วยผู้เล่นสองคนที่นั่งอยู่ แล้วแจ้งทั้งห้อง
func (r *Room) begin() {
	r.start(r.seats[0], r.seats[1])
	r.persist()
	r.broadcastState()
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
	r.publishActivity()
	now := time.Now()
	base := stateMsg{
		Type:        "state",
		Room:        r.id,
		Status:      r.status,
		Game:        r.game.Variant(),
		FEN:         r.game.FEN(),
		Turn:        r.game.Turn(),
		Ply:         r.game.Ply(),
		TimeControl: r.clock.tc.String(),
		Clock: clockInfo{
			White:   r.clock.left(game.White, now).Milliseconds(),
			Black:   r.clock.left(game.Black, now).Milliseconds(),
			Running: r.clock.running,
			Delay:   r.clock.delay(now).Milliseconds(),
		},
	}
	if lm := r.game.LastMove(); lm != nil {
		base.LastMove = &moveInfo{From: lm.From, To: lm.To}
	}
	if r.status != StatusWaiting {
		base.Players = map[game.Color]*playerInfo{}
		for color, id := range r.players {
			profile := r.profiles[id]
			info := &playerInfo{
				Connected: r.connected(id),
				Name:      profile.Name,
				Avatar:    profile.Avatar,
				Guest:     auth.IsGuest(id),
				Sender:    r.chatSender(id),
				Set:       r.sets[id],
			}
			if at, ok := r.abandonAt[color]; ok {
				// ปัดขึ้น เพื่อไม่ให้ client เห็น 0 ทั้งที่ยังเหลือเวลา
				info.GraceLeft = max(1, int(math.Ceil(at.Sub(now).Seconds())))
			}
			base.Players[color] = info
		}
	}
	base.Spectators, base.Watching = r.spectators()
	if !r.closeAt.IsZero() {
		// ปัดขึ้นเป็นอย่างน้อย 1 เพื่อให้ฝั่งเว็บรู้ว่ากำลังนับอยู่ แม้เหลือเวลาน้อยมาก
		base.CloseIn = max(1, r.closeAt.Sub(now).Milliseconds())
	}
	base.Result, base.Reason = r.game.Result()
	if r.status == StatusPlaying {
		// เกมที่หน้าเว็บไม่มีกติกาของตัวเอง: ส่งตาเดินที่ถูกกติกาไปให้ใช้ไฮไลต์ (ตาเดินจริงยังถูกตรวจที่นี่เสมอ)
		base.Legal, base.Check, base.Count = r.game.Legal(), r.game.Check(), r.game.Count()
		base.Reach = r.game.Reach()
		base.Forced = r.game.Forced()
	}

	// ผู้ใช้คนเดียวกันได้ข้อความเหมือนกัน จึง encode ครั้งเดียวต่อ user
	encoded := map[string][]byte{}
	for c := range r.clients {
		b, ok := encoded[c.UserID]
		if !ok {
			msg := base
			msg.You = r.youInfo(c.UserID)
			msg.Lobby = r.lobbyFor(c.UserID, now)
			b = mustJSON(msg)
			encoded[c.UserID] = b
		}
		c.Send(b)
	}
}

// spectators คืนผู้ชมที่กำลังเชื่อมต่ออยู่ (คนที่ไม่ได้นั่งและไม่ได้เป็นผู้เล่น) กับจำนวนทั้งหมด
// คนเดียวกันที่เปิดหลายแท็บนับครั้งเดียว เรียงตาม user ID เพื่อให้ลำดับที่นั่งไม่สลับไปมาทุกครั้งที่ส่ง state
func (r *Room) spectators() ([]spectatorInfo, int) {
	var ids []string
	for c := range r.clients {
		if !r.isSeated(c.UserID) && !slices.Contains(ids, c.UserID) {
			ids = append(ids, c.UserID)
		}
	}
	slices.Sort(ids)
	total := len(ids)
	if total > maxSpectatorsListed {
		ids = ids[:maxSpectatorsListed]
	}
	out := make([]spectatorInfo, len(ids))
	for i, id := range ids {
		profile := r.profiles[id]
		out[i] = spectatorInfo{Name: profile.Name, Avatar: profile.Avatar, Guest: auth.IsGuest(id)}
	}
	return out, total
}

// lobbyFor คืนสถานะห้องรอสำหรับผู้ใช้คนหนึ่ง หรือ nil ถ้าไม่ได้อยู่ในช่วงรอ
func (r *Room) lobbyFor(userID string, now time.Time) *lobbyInfo {
	if r.status != StatusWaiting || !r.cfg.Lobby {
		return nil
	}
	host := r.hostID()
	info := &lobbyInfo{
		Seats:   make([]lobbySeat, len(r.seats)),
		CanKick: userID == host && len(r.seats) == 2,
		Removed: r.removed[userID],
	}
	for i, id := range r.seats {
		profile := r.profiles[id]
		info.Seats[i] = lobbySeat{
			Name:      profile.Name,
			Avatar:    profile.Avatar,
			Guest:     auth.IsGuest(id),
			Connected: r.connected(id),
			Ready:     r.ready[id],
			You:       id == userID,
			Sender:    r.chatSender(id),
			Host:      id == host,
		}
	}
	if !r.startAt.IsZero() {
		// ปัดขึ้นเป็นอย่างน้อย 1 เพื่อให้ฝั่งเว็บรู้ว่ากำลังนับอยู่ แม้เหลือเวลาน้อยมาก
		info.Countdown = max(1, r.startAt.Sub(now).Milliseconds())
	}
	return info
}

func (r *Room) youInfo(userID string) youInfo {
	if color, ok := r.colorOf(userID); ok {
		return youInfo{Role: rolePlayer, Color: color}
	}
	if slices.Contains(r.seats, userID) {
		return youInfo{Role: rolePlayer}
	}
	return youInfo{Role: roleSpectator}
}
