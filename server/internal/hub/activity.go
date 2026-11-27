package hub

import (
	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// Activity คือสิ่งที่ผู้ใช้คนหนึ่งกำลังทำอยู่ในห้อง: นั่งรอในห้องรอ หรือกำลังเล่น
// ใช้ในหน้าดูสมาชิกของผู้ดูแล (ผู้ชมและเกมที่จบแล้วไม่นับ)
type Activity struct {
	Room string
	Game game.Variant
	// Status เป็น StatusWaiting หรือ StatusPlaying เท่านั้น
	Status Status
	// Connected คือยังมี connection เปิดอยู่ในห้องนั้น (false = หลุดหรือปิดหน้าไปแล้ว)
	Connected bool
	// Opponent คือ user ID ของอีกฝ่าย ("" = ยังไม่มี)
	Opponent string
}

// publishActivity เก็บภาพล่าสุดของผู้เล่นในห้องไว้ให้ Hub.Activity อ่าน
// เรียกจาก goroutine ของห้องทุกครั้งที่สถานะเปลี่ยน (หรือก่อนห้องเริ่มทำงาน)
func (r *Room) publishActivity() {
	out := map[string]Activity{}
	base := Activity{Room: r.id, Game: r.game.Variant(), Status: r.status}
	switch r.status {
	case StatusWaiting:
		for i, id := range r.seats {
			a := base
			a.Connected = r.connected(id)
			if len(r.seats) == 2 {
				a.Opponent = r.seats[1-i]
			}
			out[id] = a
		}
	case StatusPlaying:
		for color, id := range r.players {
			a := base
			a.Connected = r.connected(id)
			a.Opponent = r.players[color.Other()]
			out[id] = a
		}
	}
	r.activity.Store(&out)
}

// Activity คืนสิ่งที่ผู้ใช้แต่ละคนกำลังทำอยู่ (user ID → กิจกรรม) เฉพาะคนที่นั่งรอหรือกำลังเล่น
// ถ้าคนเดียวอยู่หลายห้อง เลือกห้องที่กำลังเล่นก่อน แล้วจึงห้องที่ยังเชื่อมต่ออยู่
// ข้อมูลเป็นภาพ ณ ตอนที่แต่ละห้องเปลี่ยนสถานะครั้งล่าสุด ไม่รอ goroutine ของห้อง จึงคืนทันทีเสมอ
func (h *Hub) Activity() map[string]Activity {
	h.mu.Lock()
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()

	out := map[string]Activity{}
	for _, r := range rooms {
		seen := r.activity.Load()
		if seen == nil {
			continue
		}
		for id, a := range *seen {
			if cur, ok := out[id]; !ok || moreActive(a, cur) {
				out[id] = a
			}
		}
	}
	return out
}

func moreActive(a, b Activity) bool {
	if (a.Status == StatusPlaying) != (b.Status == StatusPlaying) {
		return a.Status == StatusPlaying
	}
	return a.Connected && !b.Connected
}
