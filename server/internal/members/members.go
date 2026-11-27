// Package members คือข้อมูลของผู้ที่สมัครบัญชี สำหรับหน้าดูสมาชิกของผู้ดูแล
// สถิติทั้งหมดนับจากตาราง games (เกมที่จบแล้ว) ผู้เล่นรับเชิญไม่มีบัญชี จึงไม่อยู่ในรายการ
package members

import (
	"context"
	"errors"
	"time"
)

// ErrNotFound คือไม่มีบัญชีที่ถามถึง
var ErrNotFound = errors.New("member not found")

// Stats คือผลรวมของเกมที่จบแล้ว จากมุมของผู้เล่นคนหนึ่ง
type Stats struct {
	Games  int `json:"games"`
	Wins   int `json:"wins"`
	Losses int `json:"losses"`
	Draws  int `json:"draws"`
	// Seconds คือเวลาเล่นรวม (ตั้งแต่เกมเริ่มจนจบ ของทุกเกม)
	Seconds int64 `json:"seconds"`
	// LastPlayed คือเวลาที่เกมล่าสุดจบ (nil = ยังไม่เคยเล่นจนจบ)
	LastPlayed *time.Time `json:"lastPlayedAt,omitempty"`
}

// Member คือบัญชีหนึ่งบัญชีกับสถิติรวมทุกเกม
type Member struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	// Name และ Avatar มาจากโปรไฟล์ (ว่างถ้าไม่ได้ตั้ง)
	Name       string     `json:"name,omitempty"`
	Avatar     string     `json:"avatar,omitempty"`
	JoinedAt   time.Time  `json:"joinedAt"`
	LastSignIn *time.Time `json:"lastSignInAt,omitempty"`
	Stats
}

// GameStats คือสถิติของเกมชนิดหนึ่ง
type GameStats struct {
	Game string `json:"game"`
	Stats
}

// Opponent คือคู่แข่งคนหนึ่ง กับสถิติที่เจอกัน (นับจากมุมของสมาชิกที่กำลังดู)
// ID ว่าง = ผู้เล่นรับเชิญทั้งหมดรวมกัน (ไม่มีบัญชีให้แยกคน)
type Opponent struct {
	ID     string `json:"id,omitempty"`
	Name   string `json:"name,omitempty"`
	Avatar string `json:"avatar,omitempty"`
	Email  string `json:"email,omitempty"`
	Stats
}

// GameRow คือเกมที่จบแล้วหนึ่งเกม จากมุมของสมาชิกที่กำลังดู
type GameRow struct {
	Game string `json:"game"`
	// Color คือสีที่สมาชิกเล่น ("w" หรือ "b")
	Color string `json:"color"`
	// Outcome คือ "win", "loss" หรือ "draw"
	Outcome     string    `json:"outcome"`
	Reason      string    `json:"reason"`
	TimeControl string    `json:"tc"`
	StartedAt   time.Time `json:"startedAt"`
	Seconds     int64     `json:"seconds"`
	// คู่แข่ง: OpponentID ว่าง = ผู้เล่นรับเชิญ
	OpponentID    string `json:"opponentId,omitempty"`
	OpponentName  string `json:"opponentName,omitempty"`
	OpponentEmail string `json:"opponentEmail,omitempty"`
}

// Detail คือข้อมูลทั้งหมดของสมาชิกหนึ่งคน
type Detail struct {
	Member
	ByGame    []GameStats `json:"byGame"`
	Opponents []Opponent  `json:"opponents"`
	// Recent คือเกมล่าสุด ใหม่สุดก่อน (จำกัดจำนวน)
	Recent []GameRow `json:"recent"`
}

// Store อ่านข้อมูลสมาชิก
type Store interface {
	// List คืนทุกบัญชี คนที่สมัครล่าสุดก่อน
	List(ctx context.Context) ([]Member, error)
	// Get คืนรายละเอียดของบัญชีหนึ่ง หรือ ErrNotFound
	Get(ctx context.Context, userID string) (*Detail, error)
}
