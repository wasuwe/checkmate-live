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
	msgAuth   = "auth"
	msgJoin   = "join"
	msgMove   = "move"
	msgResign = "resign"
	msgChat   = "chat"
	msgReport = "report"
	msgReady  = "ready"
	msgKick   = "kick"
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
	Text  string `json:"text,omitempty"`
	ID    *int   `json:"id,omitempty"`
	Ready *bool  `json:"ready,omitempty"`
}

var (
	errBadMessage = errors.New("bad message")

	squareRe = regexp.MustCompile(`^[a-h][1-8]$`)
	promoRe  = regexp.MustCompile(`^[qrbn]?$`)
	// ตัวอักษรผสมตัวเลข 6 ตัว (ดู newRoomID) หรือรหัสตัวเลข 6 หลักแบบเดิม ซึ่งยังรับไว้ให้ห้องที่เปิดค้างก่อนเปลี่ยน
	// กู้คืนและเข้าได้จนกว่าจะปิดไปเอง
	roomIDRe = regexp.MustCompile(`^(?:[A-HJKMNP-Z2-9]{6}|[1-9][0-9]{5})$`)
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

	// inbound เป็น struct รวมของทุกชนิดข้อความ จึงต้องตรวจเองว่าไม่มี field ของชนิดอื่นปนมา
	// allowed คือข้อความเดียวกันที่เหลือเฉพาะ field ของชนิดนั้น ถ้าไม่เท่ากับ m แปลว่ามี field เกิน
	allowed := inbound{Type: m.Type}
	switch m.Type {
	case msgAuth:
		allowed.Token = m.Token
	case msgJoin:
		allowed.Room = m.Room
	case msgMove:
		allowed.Ply, allowed.From, allowed.To, allowed.Promo = m.Ply, m.From, m.To, m.Promo
	case msgChat:
		allowed.Text = m.Text
	case msgReport:
		allowed.ID = m.ID
	case msgReady:
		allowed.Ready = m.Ready
	}
	if m != allowed {
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
	case msgKick:
		// ไม่มี field เพิ่ม: คนที่ถูกให้ออกคือผู้เล่นอีกคนในห้องรอเสมอ เซิร์ฟเวอร์ไม่รับว่าจะให้ใครออกจาก client
	case msgResign:
		// ไม่มี field เพิ่ม: ผู้แพ้คือเจ้าของ connection เซิร์ฟเวอร์ไม่รับ winner/color จาก client
	case msgChat:
		text, ok := cleanChatText(m.Text)
		if !ok {
			return inbound{}, errBadMessage
		}
		m.Text = text
	case msgReport:
		if m.ID == nil || *m.ID < 1 {
			return inbound{}, errBadMessage
		}
	case msgReady:
		if m.Ready == nil {
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

	errCodeChatRateLimited = "chat_rate_limited"
	// errCodeRateLimited คือส่งข้อความถี่เกินโควตาของ connection ข้อความนั้นถูกทิ้ง
	errCodeRateLimited = "rate_limited"
	// errCodeTooManyConnections คือผู้ใช้คนนี้เปิด connection พร้อมกันครบจำนวนแล้ว
	errCodeTooManyConnections = "too_many_connections"
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
	// GraceLeft คือจำนวนวินาทีที่ผู้เล่นซึ่งหลุดอยู่ยังกลับเข้ามาได้ก่อนถูกปรับแพ้ (มีเฉพาะตอนหลุด)
	GraceLeft int `json:"graceLeft,omitempty"`
	// Name และ Avatar มาจากโปรไฟล์ของผู้ใช้ที่ login (ว่างถ้าไม่ได้ตั้ง) ไม่มีการส่ง user ID ของคู่แข่ง
	Name   string `json:"name,omitempty"`
	Avatar string `json:"avatar,omitempty"`
	// Guest คือผู้เล่นที่ไม่ได้ login
	Guest bool `json:"guest,omitempty"`
	// Sender คือเลขประจำตัวในแชทของผู้เล่นคนนี้ ให้ฝั่งเว็บใส่ชื่อให้ข้อความที่ส่งตั้งแต่อยู่ในห้องรอ
	Sender string `json:"sender,omitempty"`
}

// lobbySeat คือที่นั่งหนึ่งที่ในห้องรอ (ยังไม่มีสี สีถูกสุ่มตอนเริ่มเกม)
type lobbySeat struct {
	Name      string `json:"name,omitempty"`
	Avatar    string `json:"avatar,omitempty"`
	Guest     bool   `json:"guest,omitempty"`
	Connected bool   `json:"connected"`
	Ready     bool   `json:"ready"`
	// You คือที่นั่งของผู้รับข้อความนี้
	You    bool   `json:"you,omitempty"`
	Sender string `json:"sender,omitempty"`
	// Host คือที่นั่งของเจ้าของห้อง
	Host bool `json:"host,omitempty"`
}

// lobbyInfo คือสถานะของห้องรอ มีเฉพาะตอน status เป็น waiting และเปิดใช้ห้องรอ
type lobbyInfo struct {
	Seats []lobbySeat `json:"seats"`
	// Countdown คือมิลลิวินาทีที่เหลือก่อนเกมเริ่ม (มีเฉพาะตอนทุกคนพร้อมแล้ว)
	Countdown int64 `json:"countdown,omitempty"`
	// CanKick คือผู้รับข้อความนี้เป็นเจ้าของห้อง และมีผู้เล่นอีกคนที่ให้ออกจากที่นั่งได้
	CanKick bool `json:"canKick,omitempty"`
	// Removed คือผู้รับข้อความนี้ถูกเจ้าของห้องให้ออกจากที่นั่งแล้ว (ยังดูเกมได้ แต่กลับมานั่งไม่ได้)
	Removed bool `json:"removed,omitempty"`
}

// clockInfo คือเวลาที่เหลือของแต่ละฝั่งเป็นมิลลิวินาที ณ ตอนที่ส่งข้อความ
// Running คือฝั่งที่นาฬิกากำลังเดิน ("" = หยุด) ฝั่งเว็บนับต่อเองเพื่อแสดงผลเท่านั้น
type clockInfo struct {
	White   int64      `json:"w"`
	Black   int64      `json:"b"`
	Running game.Color `json:"running"`
	// Delay คือมิลลิวินาทีที่เหลือก่อนนาฬิกาของฝั่ง Running จะเริ่มนับ (มีเฉพาะช่วงโยนเหรียญตอนเริ่มเกม)
	Delay int64 `json:"delay,omitempty"`
}

type youInfo struct {
	Role  string     `json:"role"`
	Color game.Color `json:"color"` // "" ถ้าเป็นคนดู หรือยังไม่ได้สุ่มสี
}

// stateMsg คือภาพรวมทั้งหมดของห้อง ส่งทุกครั้งที่มีอะไรเปลี่ยน
// client ที่เพิ่งเข้าหรือ reconnect ใช้ข้อความนี้ข้อความเดียวก็วาดหน้าจอได้ครบ
type stateMsg struct {
	Type   string `json:"type"` // "state"
	Room   string `json:"room"`
	Status Status `json:"status"`
	// Game คือชนิดของเกม ("chess", "makruk", "checkers", "neeb")
	Game     game.Variant               `json:"game"`
	FEN      string                     `json:"fen"`
	Turn     game.Color                 `json:"turn"`
	Ply      int                        `json:"ply"`
	LastMove *moveInfo                  `json:"lastMove,omitempty"`
	Players  map[game.Color]*playerInfo `json:"players,omitempty"`
	You      youInfo                    `json:"you"`
	// TimeControl เช่น "10+0" (นาที+วินาทีที่บวกต่อตา)
	TimeControl string    `json:"tc"`
	Clock       clockInfo `json:"clock"`
	Result      string    `json:"result,omitempty"`
	Reason      string    `json:"reason,omitempty"`
	// Legal, Check, Count มีเฉพาะเกมที่หน้าเว็บไม่ได้คำนวณกติกาเอง และเฉพาะระหว่างเล่น
	// Legal: ช่องต้นทาง → ช่องปลายทางของฝ่ายที่ถึงตา, Check: ช่องของขุนที่ถูกรุก
	Legal map[string][]string `json:"legal,omitempty"`
	Check string              `json:"check,omitempty"`
	Count *game.Count         `json:"count,omitempty"`
	// Forced คือฝ่ายที่ถึงตาต้องกิน (หมากฮอสบังคับกิน)
	Forced bool `json:"forced,omitempty"`
	// Lobby มีเฉพาะตอนรอเริ่มเกม
	Lobby *lobbyInfo `json:"lobby,omitempty"`
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
