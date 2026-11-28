package hub

import "sync"

// sendBuffer คือจำนวนข้อความขาออกที่ค้างได้ต่อ connection
// ถ้าเต็มแปลว่า client รับไม่ทัน จะถูกตัดการเชื่อมต่อแทนที่จะทำให้ห้องค้าง
const sendBuffer = 32

// PlayerProfile คือชื่อและรูปที่ผู้เล่นคนอื่นในห้องเห็น
type PlayerProfile struct {
	Name   string // "" = ยังไม่ได้ตั้งชื่อ
	Avatar string // รหัสรูป "" = ไม่มีรูป
}

// Client คือ connection หนึ่งเส้นของผู้ใช้ ผู้ใช้คนเดียวมีได้หลาย Client (หลายแท็บ)
type Client struct {
	UserID string
	// Profile คือชื่อและรูป ณ ตอนที่เชื่อมต่อ
	Profile PlayerProfile
	// Device คือรหัสเครื่องที่หน้าเว็บส่งมาตอนขอเข้าห้อง ("" = ไม่ได้ส่ง) ตั้งก่อนส่ง Client เข้าห้อง แล้วไม่เปลี่ยนอีก
	Device string

	send     chan []byte
	kick     func()
	kickOnce sync.Once
}

func newClient(userID string, kick func()) *Client {
	return &Client{UserID: userID, send: make(chan []byte, sendBuffer), kick: kick}
}

// Send ใส่ข้อความเข้าคิวขาออกโดยไม่ block
func (c *Client) Send(b []byte) {
	select {
	case c.send <- b:
	default:
		c.Kick()
	}
}

// Kick ตัดการเชื่อมต่อของ client นี้
func (c *Client) Kick() {
	c.kickOnce.Do(c.kick)
}
