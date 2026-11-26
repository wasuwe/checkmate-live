package hub

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// ---------- Client → Server ----------

// ชนิดข้อความขาเข้า
const (
	msgAuth = "auth"
	msgJoin = "join"
	msgMove = "move"
)

// inbound คือข้อความขาเข้าทุกชนิดรวมกัน field ที่ไม่รู้จักจะถูกปฏิเสธ
type inbound struct {
	Type  string `json:"type"`
	Token string `json:"token,omitempty"`
	Room  string `json:"room,omitempty"`
	Ply   *int   `json:"ply,omitempty"`
	From  string `json:"from,omitempty"`
	To    string `json:"to,omitempty"`
	Promo string `json:"promo,omitempty"`
}

var (
	errBadMessage = errors.New("bad message")

	squareRe = regexp.MustCompile(`^[a-h][1-8]$`)
	promoRe  = regexp.MustCompile(`^[qrbn]?$`)
	roomIDRe = regexp.MustCompile(`^[a-z2-9]{12}$`)
)

// decodeInbound แปลงและตรวจรูปแบบข้อความ ห้ามมี field แปลกปลอมหรือข้อมูลต่อท้าย
func decodeInbound(data []byte) (inbound, error) {
	var m inbound
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return inbound{}, errBadMessage
	}
	if _, err := dec.Token(); err != io.EOF {
		return inbound{}, errBadMessage
	}

	switch m.Type {
	case msgAuth:
		if m.Token == "" {
			return inbound{}, errBadMessage
		}
	case msgJoin:
		if !roomIDRe.MatchString(m.Room) {
			return inbound{}, errBadMessage
		}
	case msgMove:
		if m.Ply == nil || *m.Ply < 0 ||
			!squareRe.MatchString(m.From) || !squareRe.MatchString(m.To) || !promoRe.MatchString(m.Promo) {
			return inbound{}, errBadMessage
		}
	default:
		return inbound{}, errBadMessage
	}
	return m, nil
}

// ---------- Server → Client ----------

// รหัส error ที่ส่งให้ client
const (
	errCodeBadMessage    = "bad_message"
	errCodeUnauthorized  = "unauthorized"
	errCodeRoomNotFound  = "room_not_found"
	errCodeAlreadyJoined = "already_joined"
	errCodeNotJoined     = "not_joined"
	errCodeNotAPlayer    = "not_a_player"
	errCodeGameNotActive = "game_not_active"
	errCodeNotYourTurn   = "not_your_turn"
	errCodeStaleMove     = "stale_move"
	errCodeIllegalMove   = "illegal_move"
)

// Status คือสถานะของห้อง
type Status string

const (
	StatusWaiting  Status = "waiting"
	StatusPlaying  Status = "playing"
	StatusFinished Status = "finished"
)

// บทบาทของผู้ใช้ในห้อง
const (
	rolePlayer    = "player"
	roleSpectator = "spectator"
)

type authOKMsg struct {
	Type   string `json:"type"` // "auth_ok"
	UserID string `json:"userId"`
}

type errorMsg struct {
	Type string `json:"type"` // "error"
	Code string `json:"code"`
}

type gameOverMsg struct {
	Type   string `json:"type"` // "game_over"
	Result string `json:"result"`
	Reason string `json:"reason"`
}

type moveInfo struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type playerInfo struct {
	Connected bool `json:"connected"`
}

type youInfo struct {
	Role  string     `json:"role"`
	Color game.Color `json:"color"` // "" ถ้าเป็นคนดู หรือยังไม่ได้สุ่มสี
}

// stateMsg คือภาพรวมทั้งหมดของห้อง ส่งทุกครั้งที่มีอะไรเปลี่ยน
// client ที่เพิ่งเข้าหรือ reconnect ใช้ข้อความนี้ข้อความเดียวก็วาดหน้าจอได้ครบ
type stateMsg struct {
	Type     string                     `json:"type"` // "state"
	Room     string                     `json:"room"`
	Status   Status                     `json:"status"`
	FEN      string                     `json:"fen"`
	Turn     game.Color                 `json:"turn"`
	Ply      int                        `json:"ply"`
	LastMove *moveInfo                  `json:"lastMove,omitempty"`
	Players  map[game.Color]*playerInfo `json:"players,omitempty"`
	You      youInfo                    `json:"you"`
	Result   string                     `json:"result,omitempty"`
	Reason   string                     `json:"reason,omitempty"`
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err) // ชนิดข้อความเป็นของเราเองทั้งหมด marshal ต้องไม่พลาด
	}
	return b
}

func encodeError(code string) []byte {
	return mustJSON(errorMsg{Type: "error", Code: code})
}
