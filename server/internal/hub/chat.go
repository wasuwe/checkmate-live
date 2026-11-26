package hub

import (
	"strconv"
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
	// แต่ละคนรายงานรัวได้ 3 ครั้ง จากนั้น 1 ครั้งต่อ 20 วินาที
	reportBurst    = 3
	reportInterval = 20 * time.Second
)

// ChatReport คือการรายงานข้อความแชทหนึ่งครั้ง ส่งให้ Config.OnReport
type ChatReport struct {
	RoomID     string
	MessageID  int
	Text       string
	SenderID   string // user ID ของผู้ส่งข้อความ
	ReporterID string
	SentAt     time.Time
	ReportedAt time.Time
}

type reportKey struct {
	messageID int
	reporter  string
}

type reportOKMsg struct {
	Type string `json:"type"` // "report_ok"
	ID   int    `json:"id"`
}

// chatEntry คือข้อความแชทหนึ่งข้อความที่ห้องเก็บไว้
type chatEntry struct {
	id     int
	userID string
	sender string     // เลขประจำตัวในห้องของผู้ส่ง เช่น "u3"
	from   game.Color // "" = ผู้ชม หรือผู้เล่นที่ยังไม่ได้สี
	text   string
	at     time.Time
}

type chatItem struct {
	ID int `json:"id"`
	// Sender คือเลขประจำตัวในห้องของผู้ส่ง ข้อความจากคนเดียวกันได้ค่าเดียวกัน (ไม่ใช่ user ID)
	Sender string     `json:"sender"`
	From   game.Color `json:"from"`
	Text   string     `json:"text"`
	At     int64      `json:"at"` // unix ms
	Mine   bool       `json:"mine"`
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
	return chatItem{ID: e.id, Sender: e.sender, From: e.from, Text: e.text, At: e.at.UnixMilli(), Mine: e.userID == viewer}
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
	entry := chatEntry{id: r.chatSeq, userID: c.UserID, sender: r.chatSender(c.UserID), from: color, text: text, at: now}
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

// chatSender คืนเลขประจำตัวในห้องของผู้ใช้ สร้างใหม่เมื่อส่งแชทครั้งแรก
func (r *Room) chatSender(userID string) string {
	n, ok := r.chatSenders[userID]
	if !ok {
		n = len(r.chatSenders) + 1
		r.chatSenders[userID] = n
	}
	return "u" + strconv.Itoa(n)
}

// handleReport รับการรายงานข้อความแชท
// ผู้ถูกรายงานคือผู้ส่งข้อความนั้นตามที่ห้องบันทึกไว้ ไม่รับตัวตนหรือเนื้อความจาก client
func (r *Room) handleReport(c *Client, messageID int) {
	limiter, ok := r.reportLimiters[c.UserID]
	if !ok {
		limiter = rate.NewLimiter(rate.Every(reportInterval), reportBurst)
		r.reportLimiters[c.UserID] = limiter
	}
	now := time.Now()
	if !limiter.AllowN(now, 1) {
		c.Send(encodeError(errCodeRateLimited))
		return
	}

	var entry *chatEntry
	for i := range r.chat {
		if r.chat[i].id == messageID {
			entry = &r.chat[i]
			break
		}
	}
	// ข้อความที่ไม่มี (หรือเก่าจนหลุดจากประวัติ) และข้อความของตัวเอง: ไม่ทำอะไร
	if entry == nil || entry.userID == c.UserID {
		return
	}

	key := reportKey{messageID: messageID, reporter: c.UserID}
	if _, dup := r.reported[key]; !dup {
		r.reported[key] = struct{}{}
		if r.cfg.OnReport != nil {
			r.cfg.OnReport(ChatReport{
				RoomID:     r.id,
				MessageID:  messageID,
				Text:       entry.text,
				SenderID:   entry.userID,
				ReporterID: c.UserID,
				SentAt:     entry.at,
				ReportedAt: now,
			})
		}
	}
	c.Send(mustJSON(reportOKMsg{Type: "report_ok", ID: messageID}))
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
