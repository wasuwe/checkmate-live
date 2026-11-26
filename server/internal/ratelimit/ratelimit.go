// Package ratelimit จำกัดความถี่และจำนวนการใช้งานต่อ key (เช่น ต่อ IP หรือต่อผู้ใช้)
// ทุกอย่างอยู่ใน memory ของเซิร์ฟเวอร์เครื่องเดียว ซึ่งตรงกับการ deploy แบบ instance เดียว
package ratelimit

import (
	"net"
	"net/http"
	"net/netip"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Rule คือโควตาแบบ token bucket: ใช้รัวได้ Burst ครั้ง จากนั้นได้คืน 1 ครั้งทุก Every
type Rule struct {
	Every time.Duration
	Burst int
}

type entry struct {
	limiter *rate.Limiter
	seen    time.Time
}

// Limiter จำกัดความถี่แยกตาม key
type Limiter struct {
	rule Rule
	ttl  time.Duration // key ที่ไม่ถูกใช้นานเท่านี้มีโควตาเต็มแล้ว จึงลืมได้
	now  func() time.Time

	mu        sync.Mutex
	entries   map[string]*entry
	lastSweep time.Time
}

// New สร้าง Limiter ตาม rule
func New(rule Rule) *Limiter {
	return newLimiter(rule, time.Now)
}

func newLimiter(rule Rule, now func() time.Time) *Limiter {
	if rule.Burst < 1 {
		rule.Burst = 1
	}
	return &Limiter{
		rule:    rule,
		ttl:     max(time.Minute, rule.Every*time.Duration(rule.Burst)),
		now:     now,
		entries: map[string]*entry{},
	}
}

// Allow ใช้โควตาหนึ่งครั้งของ key คืน false ถ้าเกินโควตา
// Limiter ที่เป็น nil อนุญาตเสมอ (ใช้เมื่อปิดการจำกัด)
func (l *Limiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	// ล้าง key เก่าเป็นระยะ ไม่งั้น map โตตามจำนวน IP ที่เคยเข้ามาทั้งหมด
	if now.Sub(l.lastSweep) > l.ttl {
		for k, e := range l.entries {
			if now.Sub(e.seen) > l.ttl {
				delete(l.entries, k)
			}
		}
		l.lastSweep = now
	}

	e, ok := l.entries[key]
	if !ok {
		e = &entry{limiter: rate.NewLimiter(rate.Every(l.rule.Every), l.rule.Burst)}
		l.entries[key] = e
	}
	e.seen = now
	return e.limiter.AllowN(now, 1)
}

// Size คืนจำนวน key ที่จำอยู่ (ใช้ใน test)
func (l *Limiter) Size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.entries)
}

// Counter จำกัดจำนวนสิ่งที่เปิดพร้อมกันต่อ key เช่น connection ต่อ IP
type Counter struct {
	max int

	mu     sync.Mutex
	counts map[string]int
}

// NewCounter สร้าง Counter ที่ยอมให้แต่ละ key ถือได้ไม่เกิน max
func NewCounter(max int) *Counter {
	return &Counter{max: max, counts: map[string]int{}}
}

// Acquire จองหนึ่งที่ให้ key คืน false ถ้าเต็ม ถ้าได้ true ต้องเรียก Release คู่กันเสมอ
func (c *Counter) Acquire(key string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.counts[key] >= c.max {
		return false
	}
	c.counts[key]++
	return true
}

// Release คืนที่ที่จองไว้
func (c *Counter) Release(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.counts[key] <= 1 {
		delete(c.counts, key)
		return
	}
	c.counts[key]--
}

// Count คืนจำนวนที่ key ถืออยู่
func (c *Counter) Count(key string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.counts[key]
}

// ClientIP คืนตัวระบุของเครื่องที่ส่งคำขอ สำหรับใช้เป็น key ของการจำกัด
//
// trustedHeader คือชื่อ header ที่ proxy หน้าเซิร์ฟเวอร์ใส่ IP จริงของ client มาให้ (เช่น "Fly-Client-IP")
// ต้องตั้งเฉพาะเมื่อเซิร์ฟเวอร์อยู่หลัง proxy ที่เขียนทับ header นี้เสมอ
// ถ้าตั้งทั้งที่เปิดรับตรงจากอินเทอร์เน็ต ใครก็ปลอม IP เพื่อหลบการจำกัดได้
// ถ้าเว้นว่างจะใช้ที่อยู่ของ connection
//
// IPv6 ถูกรวมเป็นช่วง /64 เพราะผู้ใช้หนึ่งคนมักได้ทั้งช่วงและเปลี่ยนเลขท้ายได้เอง
func ClientIP(r *http.Request, trustedHeader string) string {
	if trustedHeader != "" {
		if addr, err := netip.ParseAddr(r.Header.Get(trustedHeader)); err == nil {
			return normalize(addr)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		return normalize(addr)
	}
	return host
}

func normalize(addr netip.Addr) string {
	addr = addr.Unmap().WithZone("")
	if addr.Is6() {
		if prefix, err := addr.Prefix(64); err == nil {
			return prefix.String()
		}
	}
	return addr.String()
}
