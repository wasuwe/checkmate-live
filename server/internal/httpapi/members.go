package httpapi

import (
	"errors"
	"net/http"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/members"
)

// หน้าดูสมาชิกของผู้ดูแล: ใครสมัครไว้บ้าง กำลังเล่นอยู่ไหม เล่นอะไรไปกี่ครั้ง แพ้ชนะเสมอ ใช้เวลาเท่าไหร่ และเล่นกับใคร
//
// ทั้งสอง route อ่านอย่างเดียว และเป็นของ admin เท่านั้น เพราะคำตอบมีอีเมลของสมาชิก
// คำตอบไม่ถูกเก็บ cache (writeJSON ใส่ no-store) สถานะ "กำลังเล่น" มาจาก Hub ในหน่วยความจำ

// liveInfo คือสิ่งที่สมาชิกกำลังทำอยู่ตอนนี้
type liveInfo struct {
	// Status คือ "playing" หรือ "waiting"
	Status hub.Status `json:"status"`
	Game   string     `json:"game"`
	Room   string     `json:"room"`
	// Connected เป็น false เมื่อสมาชิกหลุดหรือปิดหน้าไป แต่ที่นั่งยังอยู่
	Connected bool `json:"connected"`
	// คู่แข่งในห้องนั้น: ชื่อ (หรืออีเมลถ้าไม่ได้ตั้งชื่อ) ของสมาชิก หรือ OpponentGuest ถ้าเป็นผู้เล่นรับเชิญ
	Opponent      string `json:"opponent,omitempty"`
	OpponentGuest bool   `json:"opponentGuest,omitempty"`
}

type memberRow struct {
	members.Member
	Live *liveInfo `json:"live,omitempty"`
}

type memberDetail struct {
	*members.Detail
	Live *liveInfo `json:"live,omitempty"`
}

// liveFor แปลงกิจกรรมจาก Hub เป็นข้อมูลที่ส่งให้หน้าเว็บ label คืนชื่อที่ใช้เรียกสมาชิกจาก user ID
func liveFor(activity map[string]hub.Activity, userID string, label func(id string) string) *liveInfo {
	a, ok := activity[userID]
	if !ok {
		return nil
	}
	out := &liveInfo{Status: a.Status, Game: string(a.Game), Room: a.Room, Connected: a.Connected}
	switch {
	case a.Opponent == "":
	case auth.IsGuest(a.Opponent):
		out.OpponentGuest = true
	default:
		out.Opponent = label(a.Opponent)
	}
	return out
}

func memberLabel(m members.Member) string {
	if m.Name != "" {
		return m.Name
	}
	return m.Email
}

// getMembers คืนสมาชิกทุกคนพร้อมสถิติรวมและสถานะตอนนี้ (admin เท่านั้น)
func (a *api) getMembers(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.admin(w, r); !ok {
		return
	}
	list, err := a.cfg.Members.List(r.Context())
	if err != nil {
		a.cfg.Logger.Error("list members", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	labels := make(map[string]string, len(list))
	for _, m := range list {
		labels[m.ID] = memberLabel(m)
	}
	activity := a.cfg.Hub.Activity()
	rows := make([]memberRow, len(list))
	for i, m := range list {
		rows[i] = memberRow{Member: m, Live: liveFor(activity, m.ID, func(id string) string { return labels[id] })}
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": rows})
}

// getMember คืนรายละเอียดของสมาชิกหนึ่งคน: สถิติแยกตามเกม คู่แข่ง และเกมล่าสุด (admin เท่านั้น)
func (a *api) getMember(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.admin(w, r); !ok {
		return
	}
	id := r.PathValue("id")
	detail, err := a.cfg.Members.Get(r.Context(), id)
	if errors.Is(err, members.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if err != nil {
		a.cfg.Logger.Error("load member", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	// ชื่อของคู่แข่งที่กำลังเล่นด้วย หาได้จากรายการคู่แข่งถ้าเคยเล่นกันจนจบ ไม่งั้นถามแยก
	label := func(opponent string) string {
		for _, o := range detail.Opponents {
			if o.ID == opponent {
				return memberLabel(members.Member{Name: o.Name, Email: o.Email})
			}
		}
		other, err := a.cfg.Members.Get(r.Context(), opponent)
		if err != nil {
			return ""
		}
		return memberLabel(other.Member)
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": memberDetail{Detail: detail, Live: liveFor(a.cfg.Hub.Activity(), detail.ID, label)}})
}
