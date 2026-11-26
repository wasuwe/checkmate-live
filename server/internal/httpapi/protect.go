package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
)

// Limits คือโควตาของ HTTP API ค่าที่เว้นว่าง (Every เป็น 0) คือไม่จำกัดเรื่องนั้น
type Limits struct {
	// Guest: ขอตัวตน guest ใหม่ ต่อ IP
	Guest ratelimit.Rule
	// Write: คำขอที่เปลี่ยนข้อมูลทั้งหมดใต้ /api ต่อ IP
	Write ratelimit.Rule
	// Read: คำขออ่านใต้ /api (รวมรูปโปรไฟล์) ต่อ IP
	Read ratelimit.Rule
	// CreateRoom: สร้างห้อง ต่อผู้ใช้
	CreateRoom ratelimit.Rule
	// Profile: แก้ชื่อหรือลบรูป ต่อผู้ใช้
	Profile ratelimit.Rule
	// Avatar: อัปโหลดรูป ต่อผู้ใช้ (งานหนักสุด เพราะต้องถอดรหัสและเข้ารหัสรูปใหม่)
	Avatar ratelimit.Rule
}

// DefaultLimits คือโควตาที่ใช้จริง เผื่อไว้สำหรับหลายคนที่ใช้อินเทอร์เน็ตเดียวกัน
var DefaultLimits = Limits{
	Guest:      ratelimit.Rule{Every: 6 * time.Second, Burst: 10},
	Write:      ratelimit.Rule{Every: time.Second, Burst: 30},
	Read:       ratelimit.Rule{Every: 250 * time.Millisecond, Burst: 120},
	CreateRoom: ratelimit.Rule{Every: 10 * time.Second, Burst: 5},
	Profile:    ratelimit.Rule{Every: 10 * time.Second, Burst: 5},
	Avatar:     ratelimit.Rule{Every: time.Minute, Burst: 3},
}

// limiters คือ Limiter ที่สร้างจาก Limits ตัวที่เป็น nil ไม่จำกัด
type limiters struct {
	guest, write, read, createRoom, profile, avatar *ratelimit.Limiter
}

func newLimiters(l *Limits) limiters {
	if l == nil {
		return limiters{}
	}
	mk := func(r ratelimit.Rule) *ratelimit.Limiter {
		if r.Every <= 0 {
			return nil
		}
		return ratelimit.New(r)
	}
	return limiters{
		guest:      mk(l.Guest),
		write:      mk(l.Write),
		read:       mk(l.Read),
		createRoom: mk(l.CreateRoom),
		profile:    mk(l.Profile),
		avatar:     mk(l.Avatar),
	}
}

// tooMany ตอบ 429
func tooMany(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "10")
	writeError(w, http.StatusTooManyRequests, "rate_limited")
}

// limitByIP จำกัดคำขอใต้ /api ต่อ IP ก่อนถึง handler ใด ๆ (รวมก่อนตรวจ token)
// WebSocket ไม่ผ่านตรงนี้ เพราะมีการจำกัดของตัวเองใน hub
func (a *api) limitByIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			limiter := a.limits.write
			if r.Method == http.MethodGet || r.Method == http.MethodHead {
				limiter = a.limits.read
			}
			if !limiter.Allow(a.cfg.ClientIP(r)) {
				tooMany(w)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeaders ใส่ header ป้องกันพื้นฐานให้ทุก response
func (a *api) securityHeaders(next http.Handler) http.Handler {
	// connect-src: API และ WebSocket ของเราเอง กับ Supabase Auth ที่หน้าเว็บเรียกตรง
	connect := "'self'"
	for _, src := range a.cfg.ConnectSrc {
		connect += " " + src
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		// 'self' ใน connect-src ไม่ครอบคลุม ws/wss ในเบราว์เซอร์เก่าบางตัว จึงระบุ host ของตัวเองตรง ๆ ด้วย
		// r.Host ถูกจำกัดชุดอักขระก่อนใช้ เพราะเป็นค่าที่ client ส่งมา
		self := ""
		if host := r.Host; host != "" && strings.Trim(host, hostChars) == "" {
			self = " ws://" + host + " wss://" + host
		}
		h.Set("Content-Security-Policy", strings.Join([]string{
			"default-src 'self'",
			"script-src 'self'",
			// กระดานหมากรุกกำหนดตำแหน่งหมากด้วย style ในตัว element จึงต้องยอม inline style
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob:",
			"connect-src " + connect + self,
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'",
		}, "; "))
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer") // ลิงก์ห้องเป็นความลับระดับหนึ่ง ไม่ส่งต่อให้เว็บอื่น
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		// เบราว์เซอร์สนใจ HSTS เฉพาะเมื่อมาทาง HTTPS การส่งเสมอจึงไม่มีผลกับการพัฒนาบน http://localhost
		h.Set("Strict-Transport-Security", "max-age=31536000")
		next.ServeHTTP(w, r)
	})
}

// hostChars คืออักขระที่ยอมให้มีใน host ที่จะนำไปใส่ CSP
const hostChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:[]"
