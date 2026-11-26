package hub

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/time/rate"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

const (
	chatMaxRunes = 200
	chatHistory  = 50 // จำนวนข้อความล่าสุดที่เก็บไว้ส่งให้คนที่เพิ่งเข้าห้อง
	// แต่ละคนส่งรัวได้ 5 ข้อความ จากนั้นเฉลี่ย 1 ข้อความต่อ 2 วินาที
	chatBurst    = 5
	chatInterval = 2 * time.Second
)

// chatEntry คือข้อความแชทหนึ่งข้อความที่ห้องเก็บไว้
type chatEntry struct {
	id     int
	userID string
	from   game.Color // "" = ผู้ชม หรือผู้เล่นที่ยังไม่ได้สี
	text   string
	at     time.Time
}

type chatItem struct {
	ID   int        `json:"id"`
	From game.Color `json:"from"`
	Text string     `json:"text"`
	At   int64      `json:"at"` // unix ms
	Mine bool       `json:"mine"`
}

type chatMsg struct {
	Type string `json:"type"` // "chat"
	chatItem
}

type chatHistoryMsg struct {
	Type     string     `json:"type"` // "chat_history"
	Messages []chatItem `json:"messages"`
}

func (e chatEntry) item(viewer string) chatItem {
	return chatItem{ID: e.id, From: e.from, Text: e.text, At: e.at.UnixMilli(), Mine: e.userID == viewer}
}

// cleanChatText ตัดช่องว่างหัวท้ายและตรวจข้อความ คืน false ถ้าใช้ไม่ได้
// ข้อความเป็นข้อความล้วนเสมอ ฝั่งเว็บแสดงเป็น text ไม่ใช่ HTML
func cleanChatText(s string) (string, bool) {
	if !utf8.ValidString(s) {
		return "", false
	}
	s = strings.TrimSpace(s)
	if s == "" || utf8.RuneCountInString(s) > chatMaxRunes {
		return "", false
	}
	for _, r := range s {
		// กันอักขระควบคุมและตัวกลับทิศทางข้อความที่ใช้ปลอมหน้าตาข้อความ
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return "", false
		}
	}
	return s, true
}

func (r *Room) handleChat(c *Client, text string) {
	limiter, ok := r.chatLimiters[c.UserID]
	if !ok {
		limiter = rate.NewLimiter(rate.Every(chatInterval), chatBurst)
		r.chatLimiters[c.UserID] = limiter
	}
	now := time.Now()
	if !limiter.AllowN(now, 1) {
		c.Send(encodeError(errCodeChatRateLimited))
		return
	}

	color, _ := r.colorOf(c.UserID)
	r.chatSeq++
	entry := chatEntry{id: r.chatSeq, userID: c.UserID, from: color, text: text, at: now}
	r.chat = append(r.chat, entry)
	if len(r.chat) > chatHistory {
		r.chat = r.chat[len(r.chat)-chatHistory:]
	}

	// ผู้ส่งกับคนอื่นได้ข้อความต่างกันแค่ field mine จึง encode สองแบบ
	mine := mustJSON(chatMsg{Type: "chat", chatItem: entry.item(c.UserID)})
	others := mustJSON(chatMsg{Type: "chat", chatItem: entry.item("")})
	for client := range r.clients {
		if client.UserID == c.UserID {
			client.Send(mine)
		} else {
			client.Send(others)
		}
	}
}

// sendChatHistory ส่งข้อความล่าสุดให้ client ที่เพิ่งเข้าห้อง
func (r *Room) sendChatHistory(c *Client) {
	if len(r.chat) == 0 {
		return
	}
	items := make([]chatItem, len(r.chat))
	for i, e := range r.chat {
		items[i] = e.item(c.UserID)
	}
	c.Send(mustJSON(chatHistoryMsg{Type: "chat_history", Messages: items}))
}
