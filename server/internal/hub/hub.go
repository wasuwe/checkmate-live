// Package hub ดูแลห้องเกมทั้งหมดและการเชื่อมต่อ WebSocket
package hub

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"math/big"
	mrand "math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
)

// Config คือค่าตั้งของ Hub ค่าที่เว้นว่างจะใช้ค่าเริ่มต้น
type Config struct {
	// OriginPatterns คือ origin ที่อนุญาตให้เปิด WebSocket นอกเหนือจาก origin เดียวกับเซิร์ฟเวอร์
	OriginPatterns []string
	// AuthTimeout คือเวลาที่ให้ client ส่งข้อความ auth หลังเชื่อมต่อ
	AuthTimeout time.Duration
	// IdleTTL คือเวลาที่ห้องว่าง (ไม่มีใครอยู่และไม่ได้กำลังเล่น) อยู่ได้ก่อนถูกลบ
	IdleTTL time.Duration
	// AbandonGrace คือเวลาที่ผู้เล่นซึ่งหลุดระหว่างเกมกลับเข้ามาได้ก่อนถูกปรับแพ้
	AbandonGrace time.Duration
	// Store คือที่เก็บข้อมูลถาวร ถ้าเป็น nil ทุกอย่างอยู่ใน memory อย่างเดียว
	Store Store
	// Profiles หาชื่อและรูปของผู้ใช้ตอนเชื่อมต่อ ถ้าเป็น nil ทุกคนไม่มีชื่อ
	// ถูกเรียกจาก goroutine ของ connection (ไม่ใช่ของห้อง) จึงรอฐานข้อมูลได้
	Profiles func(ctx context.Context, userID string) PlayerProfile
	// ClientIP คืนตัวระบุเครื่องของผู้ส่งคำขอ ใช้จำกัดจำนวน connection ต่อ IP
	// ถ้าเป็น nil ใช้ที่อยู่ของ connection
	ClientIP func(*http.Request) string
	// MaxConnsPerIP และ MaxConnsPerUser คือจำนวน WebSocket ที่เปิดพร้อมกันได้
	MaxConnsPerIP   int
	MaxConnsPerUser int
	// MessageRate คือความถี่ของข้อความที่รับต่อ connection
	MessageRate ratelimit.Rule
	// MaxRooms คือจำนวนห้องทั้งหมดที่เซิร์ฟเวอร์เก็บได้
	MaxRooms int
	// MaxOpenRoomsPerUser คือจำนวนห้องที่ยังไม่จบซึ่งผู้ใช้หนึ่งคนสร้างค้างไว้ได้
	MaxOpenRoomsPerUser int
	// OnReport ถูกเรียกเมื่อมีคนรายงานข้อความแชท เรียกจาก goroutine ของห้อง จึงต้องคืนทันที
	OnReport func(ChatReport)
	// CoinFlip ใช้สุ่มสี คืน true เพื่อสลับให้คนที่เข้าทีหลังเป็นขาว (test กำหนดเองได้)
	CoinFlip func() bool
	Logger   *slog.Logger
}

func (c Config) withDefaults() Config {
	if c.AuthTimeout == 0 {
		c.AuthTimeout = 5 * time.Second
	}
	if c.IdleTTL == 0 {
		c.IdleTTL = 10 * time.Minute
	}
	if c.AbandonGrace == 0 {
		c.AbandonGrace = 60 * time.Second
	}
	if c.ClientIP == nil {
		c.ClientIP = func(r *http.Request) string { return ratelimit.ClientIP(r, "") }
	}
	if c.MaxConnsPerIP == 0 {
		c.MaxConnsPerIP = 40 // เผื่อหลายคนใช้อินเทอร์เน็ตเดียวกัน เช่น ในโรงเรียน
	}
	if c.MaxConnsPerUser == 0 {
		c.MaxConnsPerUser = 8
	}
	if c.MessageRate.Every == 0 {
		c.MessageRate = ratelimit.Rule{Every: 100 * time.Millisecond, Burst: 20}
	}
	if c.MaxRooms == 0 {
		c.MaxRooms = 1000
	}
	if c.MaxOpenRoomsPerUser == 0 {
		c.MaxOpenRoomsPerUser = 5
	}
	if c.CoinFlip == nil {
		c.CoinFlip = func() bool { return mrand.IntN(2) == 0 }
	}
	if c.Logger == nil {
		c.Logger = slog.New(slog.DiscardHandler)
	}
	return c
}

var (
	// ErrClosed คือ Hub ถูกปิดแล้ว
	ErrClosed = errors.New("hub closed")
	// ErrServerFull คือจำนวนห้องทั้งเซิร์ฟเวอร์เต็มแล้ว
	ErrServerFull = errors.New("server is full")
	// ErrTooManyRooms คือผู้ใช้คนนี้มีห้องที่ยังไม่จบค้างอยู่ครบจำนวนแล้ว
	ErrTooManyRooms = errors.New("too many open rooms")
)

// Hub เก็บห้องทั้งหมดและส่งต่อ connection ไปยังห้องที่ถูกต้อง
type Hub struct {
	cfg  Config
	auth auth.Authenticator

	ipConns   *ratelimit.Counter
	userConns *ratelimit.Counter

	mu    sync.Mutex
	rooms map[string]*Room
	// open คือห้องที่ยังไม่จบ (รหัสห้อง → ผู้สร้าง) และ openBy คือจำนวนต่อผู้สร้าง
	open   map[string]string
	openBy map[string]int
	closed bool
	stop   chan struct{}
	wg     sync.WaitGroup
}

// New สร้าง Hub
func New(cfg Config, authn auth.Authenticator) *Hub {
	cfg = cfg.withDefaults()
	return &Hub{
		cfg:       cfg,
		auth:      authn,
		ipConns:   ratelimit.NewCounter(cfg.MaxConnsPerIP),
		userConns: ratelimit.NewCounter(cfg.MaxConnsPerUser),
		rooms:     map[string]*Room{},
		open:      map[string]string{},
		openBy:    map[string]int{},
		stop:      make(chan struct{}),
	}
}

// CreateRoom สร้างห้องใหม่และคืนรหัสห้อง ถ้า tc เป็นค่าว่างจะใช้ DefaultTimeControl
func (h *Hub) CreateRoom(tc TimeControl) (string, error) {
	return h.CreateRoomBy(tc, "")
}

// CreateRoomBy เหมือน CreateRoom แต่บันทึก user ID ของผู้สร้างห้องไว้ด้วย
func (h *Hub) CreateRoomBy(tc TimeControl, createdBy string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return "", ErrClosed
	}
	if len(h.rooms) >= h.cfg.MaxRooms {
		return "", ErrServerFull
	}
	if createdBy != "" && h.openBy[createdBy] >= h.cfg.MaxOpenRoomsPerUser {
		return "", ErrTooManyRooms
	}

	var id string
	for {
		var err error
		if id, err = newRoomID(); err != nil {
			return "", err
		}
		if _, exists := h.rooms[id]; !exists {
			break
		}
	}

	room := newRoom(id, h.cfg, tc, createdBy, h.removeRoom)
	room.onFinish = h.roomFinished
	h.rooms[id] = room
	h.trackOpen(id, createdBy)
	room.persist() // ยังไม่มี goroutine ของห้อง จึงเรียกจากตรงนี้ได้
	h.wg.Go(func() { room.run(h.stop) })
	return id, nil
}

// RoomCount คืนจำนวนห้องที่ยังเปิดอยู่
func (h *Hub) RoomCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms)
}

func (h *Hub) room(id string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.rooms[id]
}

func (h *Hub) removeRoom(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.rooms, id)
	h.untrackOpen(id)
}

// roomFinished ถูกเรียกเมื่อเกมในห้องจบ ห้องนั้นไม่นับเป็นห้องค้างของผู้สร้างอีก
func (h *Hub) roomFinished(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.untrackOpen(id)
}

// trackOpen และ untrackOpen ต้องเรียกขณะถือ h.mu
func (h *Hub) trackOpen(id, createdBy string) {
	if createdBy == "" {
		return
	}
	h.open[id] = createdBy
	h.openBy[createdBy]++
}

func (h *Hub) untrackOpen(id string) {
	createdBy, ok := h.open[id]
	if !ok {
		return
	}
	delete(h.open, id)
	if h.openBy[createdBy] <= 1 {
		delete(h.openBy, createdBy)
	} else {
		h.openBy[createdBy]--
	}
}

// Close ปิดทุกห้องและรอจนทุก goroutine ของห้องจบ
func (h *Hub) Close() {
	h.mu.Lock()
	if !h.closed {
		h.closed = true
		close(h.stop)
	}
	h.mu.Unlock()
	h.wg.Wait()
}

// roomIDAlphabet ตัดตัวอักษรที่สับสนง่ายออก (0/o, 1/l) เพราะคนต้องพิมพ์รหัสห้องเอง
const (
	roomIDAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"
	roomIDLength   = 12 // 32^12 = 60 บิต เดาไม่ได้
)

func newRoomID() (string, error) {
	limit := big.NewInt(int64(len(roomIDAlphabet)))
	b := make([]byte, roomIDLength)
	for i := range b {
		n, err := rand.Int(rand.Reader, limit)
		if err != nil {
			return "", err
		}
		b[i] = roomIDAlphabet[n.Int64()]
	}
	return string(b), nil
}
