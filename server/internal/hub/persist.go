package hub

import (
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// Store คือที่เก็บข้อมูลถาวรของห้องและเกม
// ทุก method ถูกเรียกจาก goroutine ของห้อง จึงต้องคืนทันทีโดยไม่รอฐานข้อมูล
// (ตัวจริงเข้าคิวแล้วเขียนเบื้องหลัง) ฐานข้อมูลช้าหรือล่มต้องไม่ทำให้เกมค้าง
type Store interface {
	// SaveRoom บันทึกสถานะล่าสุดของห้อง ใช้กู้ห้องคืนหลังเซิร์ฟเวอร์รีสตาร์ต
	SaveRoom(RoomSnapshot)
	// DeleteRoom ลบห้องที่ปิดแล้ว
	DeleteRoom(id string)
	// SaveGame บันทึกเกมที่จบแล้ว เรียกครั้งเดียวต่อเกม
	SaveGame(GameRecord)
}

// RoomSnapshot คือสถานะของห้องเท่าที่ต้องใช้สร้างห้องกลับมาใหม่
type RoomSnapshot struct {
	ID          string `json:"-"`
	Status      Status `json:"-"`
	CreatedBy   string `json:"-"`
	TimeControl string `json:"-"`
	// Variant คือชนิดของเกม ว่าง = หมากรุกสากล (ห้องที่บันทึกก่อนมีหลายเกม)
	Variant string `json:"variant,omitempty"`
	// Pending คือรูปแบบเก่า (ผู้เล่นคนแรกที่รอคู่) ยังอ่านได้ แต่ไม่เขียนแล้ว ใช้ Seats แทน
	Pending string `json:"pending,omitempty"`
	// Seats คือผู้เล่นที่นั่งรออยู่ในห้องรอ สูงสุด 2 คน (การกดพร้อมไม่ถูกเก็บ ต้องกดใหม่หลังเซิร์ฟเวอร์รีสตาร์ต)
	Seats      []string  `json:"seats,omitempty"`
	White      string    `json:"white,omitempty"`
	Black      string    `json:"black,omitempty"`
	Moves      []string  `json:"moves,omitempty"` // เช่น "e2e4", "e7e8q"
	ClockWhite int64     `json:"clockWhiteMs"`
	ClockBlack int64     `json:"clockBlackMs"`
	StartedAt  time.Time `json:"startedAt,omitzero"`
}

// GameRecord คือเกมที่จบแล้ว ตรงกับตาราง games
type GameRecord struct {
	RoomID      string
	WhiteID     string // user ID ของผู้เล่น (guest ขึ้นต้นด้วย "guest_")
	BlackID     string
	PGN         string
	Result      string // "1-0", "0-1", "1/2-1/2"
	Reason      string
	TimeControl string
	Variant     string // "chess", "makruk"
	StartedAt   time.Time
	EndedAt     time.Time
}

func encodeMove(m game.Move) string { return m.From + m.To + m.Promo }

func decodeMove(s string) (game.Move, error) {
	if len(s) != 4 && len(s) != 5 {
		return game.Move{}, fmt.Errorf("bad move %q", s)
	}
	m := game.Move{From: s[0:2], To: s[2:4], Promo: s[4:]}
	if !squareRe.MatchString(m.From) || !squareRe.MatchString(m.To) || !promoRe.MatchString(m.Promo) {
		return game.Move{}, fmt.Errorf("bad move %q", s)
	}
	return m, nil
}

// snapshot สร้าง RoomSnapshot จากสถานะปัจจุบัน
func (r *Room) snapshot(now time.Time) RoomSnapshot {
	moves := r.game.Moves()
	snap := RoomSnapshot{
		ID:          r.id,
		Status:      r.status,
		CreatedBy:   r.createdBy,
		TimeControl: r.clock.tc.String(),
		Variant:     string(r.game.Variant()),
		Seats:       slices.Clone(r.seats),
		White:       r.players[game.White],
		Black:       r.players[game.Black],
		Moves:       make([]string, len(moves)),
		ClockWhite:  r.clock.left(game.White, now).Milliseconds(),
		ClockBlack:  r.clock.left(game.Black, now).Milliseconds(),
		StartedAt:   r.startedAt,
	}
	for i, m := range moves {
		snap.Moves[i] = encodeMove(m)
	}
	return snap
}

// persist ส่งสถานะล่าสุดไปเก็บ เรียกเมื่อที่นั่ง ตาเดิน หรือผลเกมเปลี่ยน
func (r *Room) persist() {
	if r.cfg.Store != nil {
		r.cfg.Store.SaveRoom(r.snapshot(time.Now()))
	}
}

// persistGame บันทึกเกมที่เพิ่งจบ
func (r *Room) persistGame(now time.Time) {
	if r.cfg.Store == nil {
		return
	}
	result, reason := r.game.Result()
	r.cfg.Store.SaveGame(GameRecord{
		RoomID:      r.id,
		WhiteID:     r.players[game.White],
		BlackID:     r.players[game.Black],
		PGN:         r.game.PGN(),
		Result:      result,
		Reason:      reason,
		TimeControl: r.clock.tc.String(),
		Variant:     string(r.game.Variant()),
		StartedAt:   r.startedAt,
		EndedAt:     now,
	})
}

// ErrBadSnapshot คือ snapshot ที่ใช้สร้างห้องกลับมาไม่ได้
var ErrBadSnapshot = errors.New("bad room snapshot")

// RestoreRoom สร้างห้องกลับมาจาก snapshot หลังเซิร์ฟเวอร์รีสตาร์ต
// เวลาที่เซิร์ฟเวอร์ดับไม่ถูกหักจากนาฬิกาของใคร
// ผู้เล่นทั้งสองถือว่าหลุดอยู่ และมีเวลา AbandonGrace ในการกลับเข้ามา
func (h *Hub) RestoreRoom(snap RoomSnapshot) error {
	room, err := h.roomFromSnapshot(snap)
	if err != nil {
		return err
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return ErrClosed
	}
	if _, exists := h.rooms[snap.ID]; exists {
		return fmt.Errorf("%w: room %s already exists", ErrBadSnapshot, snap.ID)
	}
	room.onFinish = h.roomFinished
	h.rooms[snap.ID] = room
	h.trackOpen(snap.ID, snap.CreatedBy)
	h.wg.Go(func() { room.run(h.stop) })
	return nil
}

func (h *Hub) roomFromSnapshot(snap RoomSnapshot) (*Room, error) {
	if !roomIDRe.MatchString(snap.ID) {
		return nil, fmt.Errorf("%w: id %q", ErrBadSnapshot, snap.ID)
	}
	tc, err := ParseTimeControl(snap.TimeControl)
	if err != nil {
		return nil, fmt.Errorf("%w: time control %q", ErrBadSnapshot, snap.TimeControl)
	}

	variant, ok := game.ParseVariant(snap.Variant)
	if !ok {
		return nil, fmt.Errorf("%w: game %q", ErrBadSnapshot, snap.Variant)
	}

	moves := make([]game.Move, len(snap.Moves))
	for i, s := range snap.Moves {
		if moves[i], err = decodeMove(s); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrBadSnapshot, err)
		}
	}
	g, err := game.ReplayVariant(variant, moves)
	if err != nil {
		return nil, fmt.Errorf("%w: replay: %v", ErrBadSnapshot, err)
	}

	room := newRoom(snap.ID, h.cfg, variant, tc, snap.CreatedBy, h.removeRoom)
	room.game = g
	now := time.Now()

	switch snap.Status {
	case StatusWaiting:
		if len(moves) != 0 || snap.White != "" || snap.Black != "" {
			return nil, fmt.Errorf("%w: waiting room with a game in progress", ErrBadSnapshot)
		}
		seats := snap.Seats
		if len(seats) == 0 && snap.Pending != "" {
			seats = []string{snap.Pending}
		}
		if len(seats) > 2 || (len(seats) == 2 && seats[0] == seats[1]) || slices.Contains(seats, "") {
			return nil, fmt.Errorf("%w: bad lobby seats", ErrBadSnapshot)
		}
		room.seats = slices.Clone(seats)

	case StatusPlaying:
		if snap.White == "" || snap.Black == "" || snap.White == snap.Black || g.Over() {
			return nil, fmt.Errorf("%w: playing room without a live game", ErrBadSnapshot)
		}
		if snap.ClockWhite <= 0 || snap.ClockBlack <= 0 {
			return nil, fmt.Errorf("%w: clock already expired", ErrBadSnapshot)
		}
		room.status = StatusPlaying
		room.players[game.White] = snap.White
		room.players[game.Black] = snap.Black
		room.startedAt = snap.StartedAt
		room.clock.remaining[game.White] = time.Duration(snap.ClockWhite) * time.Millisecond
		room.clock.remaining[game.Black] = time.Duration(snap.ClockBlack) * time.Millisecond
		room.clock.start(g.Turn(), now)
		// ยังไม่มีใครเชื่อมต่อ: ทั้งสองฝั่งเริ่มนับเวลาผ่อนผันพร้อมกัน
		room.abandonAt[game.White] = now.Add(h.cfg.AbandonGrace)
		room.abandonAt[game.Black] = now.Add(h.cfg.AbandonGrace)

	default:
		return nil, fmt.Errorf("%w: status %q", ErrBadSnapshot, snap.Status)
	}
	return room, nil
}
