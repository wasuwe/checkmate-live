package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
)

// newProtectedServer สร้างเซิร์ฟเวอร์ที่เปิดการจำกัดตามที่กำหนด
func newProtectedServer(t *testing.T, hubCfg hub.Config, limits *Limits) *testServer {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: accountAuth{}}
	if hubCfg.CoinFlip == nil {
		hubCfg.CoinFlip = func() bool { return false }
	}
	h := hub.New(hubCfg, authn)
	srv := httptest.NewServer(New(Config{
		Hub: h, Auth: authn, Guest: guest, Profiles: profile.NewMemory(),
		Limits:     limits,
		ConnectSrc: []string{"https://project.supabase.co"},
	}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &testServer{Server: srv, t: t}
}

func errorCode(body []byte) string {
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &e)
	return e.Error
}

const slow = time.Hour // โควตาที่ไม่มีทางเติมคืนระหว่าง test

func TestGuestIssueIsRateLimitedPerIP(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, &Limits{Guest: ratelimit.Rule{Every: slow, Burst: 3}})
	for i := range 3 {
		if status, _, _ := s.call(http.MethodPost, "/api/guest", "", nil); status != http.StatusCreated {
			t.Fatalf("guest %d = %d", i+1, status)
		}
	}
	status, header, body := s.call(http.MethodPost, "/api/guest", "", nil)
	if status != http.StatusTooManyRequests || errorCode(body) != "rate_limited" || header.Get("Retry-After") == "" {
		t.Fatalf("4th guest = %d %s (Retry-After %q)", status, body, header.Get("Retry-After"))
	}
	// ส่วนอื่นของ API ไม่ถูกกระทบ
	if status, _, _ := s.call(http.MethodGet, "/healthz", "", nil); status != http.StatusOK {
		t.Fatalf("healthz = %d", status)
	}
}

func TestWriteLimitAppliesBeforeAuth(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, &Limits{Write: ratelimit.Rule{Every: slow, Burst: 4}})
	// คำขอที่ไม่มี token ก็กินโควตา จึงเดา token รัว ๆ ไม่ได้
	for range 4 {
		if status, _, _ := s.call(http.MethodPost, "/api/rooms", "bad-token", nil); status != http.StatusUnauthorized {
			t.Fatalf("unauthenticated create = %d, want 401", status)
		}
	}
	if status, _, body := s.call(http.MethodPost, "/api/rooms", "bad-token", nil); status != http.StatusTooManyRequests {
		t.Fatalf("5th write = %d %s, want 429", status, body)
	}
	// คำขออ่านใช้โควตาแยก
	if status, _, _ := s.call(http.MethodGet, "/api/profile", "acct:"+aliceID, nil); status != http.StatusOK {
		t.Fatalf("read after write limit = %d", status)
	}
}

func TestReadLimit(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, &Limits{Read: ratelimit.Rule{Every: slow, Burst: 2}})
	for range 2 {
		s.call(http.MethodGet, "/api/avatars/"+strings.Repeat("0", 32), "", nil)
	}
	if status, _, _ := s.call(http.MethodGet, "/api/avatars/"+strings.Repeat("0", 32), "", nil); status != http.StatusTooManyRequests {
		t.Fatalf("3rd read = %d, want 429", status)
	}
}

func TestCreateRoomRateIsPerUser(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MaxOpenRoomsPerUser: 100}, &Limits{CreateRoom: ratelimit.Rule{Every: slow, Burst: 2}})
	_, a := s.newGuest()
	_, b := s.newGuest()
	s.newRoom(a)
	s.newRoom(a)
	if status, _, body := s.call(http.MethodPost, "/api/rooms", a, nil); status != http.StatusTooManyRequests || errorCode(body) != "rate_limited" {
		t.Fatalf("3rd room by A = %d %s", status, body)
	}
	s.newRoom(b) // อีกคนยังสร้างได้
}

func TestOpenRoomLimitPerUser(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MaxOpenRoomsPerUser: 2}, nil)
	_, a := s.newGuest()
	_, b := s.newGuest()

	first := s.newRoom(a)
	s.newRoom(a)
	status, _, body := s.call(http.MethodPost, "/api/rooms", a, nil)
	if status != http.StatusTooManyRequests || errorCode(body) != "too_many_rooms" {
		t.Fatalf("3rd open room = %d %s", status, body)
	}
	s.newRoom(b) // ขีดจำกัดเป็นของแต่ละคน

	// เล่นห้องแรกจนจบ: ห้องที่จบแล้วไม่นับ จึงสร้างห้องใหม่ได้อีก
	ca, cb := s.connect(a), s.connect(b)
	ca.send(map[string]any{"type": "join", "room": first})
	cb.send(map[string]any{"type": "join", "room": first})
	ca.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
	ca.send(map[string]any{"type": "resign"})
	ca.until("finished", func(m msg) bool { return m.Type == "state" && m.Status == "finished" })

	if status, _, body := s.call(http.MethodPost, "/api/rooms", a, nil); status != http.StatusCreated {
		t.Fatalf("room after a game finished = %d %s", status, body)
	}
	if status, _, _ := s.call(http.MethodPost, "/api/rooms", a, nil); status != http.StatusTooManyRequests {
		t.Fatalf("limit not enforced again after the freed slot was used: %d", status)
	}
}

func TestServerRoomCap(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MaxRooms: 2}, nil)
	_, a := s.newGuest()
	_, b := s.newGuest()
	_, c := s.newGuest()
	s.newRoom(a)
	s.newRoom(b)
	if status, _, body := s.call(http.MethodPost, "/api/rooms", c, nil); status != http.StatusServiceUnavailable || errorCode(body) != "server_full" {
		t.Fatalf("room over the cap = %d %s", status, body)
	}
}

func TestProfileWriteLimits(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, &Limits{
		Profile: ratelimit.Rule{Every: slow, Burst: 2},
		Avatar:  ratelimit.Rule{Every: slow, Burst: 1},
	})
	alice, bob := "acct:"+aliceID, "acct:"+bobID
	for range 2 {
		if status, _, _ := s.call(http.MethodPut, "/api/profile", alice, []byte(`{"name":"Alice"}`)); status != http.StatusOK {
			t.Fatalf("name = %d", status)
		}
	}
	if status, _, _ := s.call(http.MethodPut, "/api/profile", alice, []byte(`{"name":"Alice"}`)); status != http.StatusTooManyRequests {
		t.Fatalf("3rd name change = %d, want 429", status)
	}
	if status, _, _ := s.call(http.MethodPut, "/api/profile", bob, []byte(`{"name":"Bobby"}`)); status != http.StatusOK {
		t.Fatalf("bob was limited by alice's usage: %d", status)
	}

	img := testPNG(t, 16)
	if status, _, _ := s.call(http.MethodPut, "/api/profile/avatar", alice, img); status != http.StatusOK {
		t.Fatalf("avatar = %d", status)
	}
	if status, _, _ := s.call(http.MethodPut, "/api/profile/avatar", alice, img); status != http.StatusTooManyRequests {
		t.Fatalf("2nd avatar = %d, want 429", status)
	}
}

func TestSecurityHeaders(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, nil)
	for _, path := range []string{"/healthz", "/api/nope", "/api/guest"} {
		method := http.MethodGet
		if path == "/api/guest" {
			method = http.MethodPost
		}
		_, h, _ := s.call(method, path, "", nil)
		csp := h.Get("Content-Security-Policy")
		for _, want := range []string{
			"default-src 'self'", "script-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'",
			"https://project.supabase.co",
		} {
			if !strings.Contains(csp, want) {
				t.Errorf("%s: CSP %q is missing %q", path, csp, want)
			}
		}
		if strings.Contains(csp, "script-src 'self' 'unsafe") || strings.Contains(csp, "*") {
			t.Errorf("%s: CSP is too loose: %q", path, csp)
		}
		if h.Get("X-Content-Type-Options") != "nosniff" || h.Get("X-Frame-Options") != "DENY" ||
			h.Get("Referrer-Policy") != "no-referrer" || !strings.HasPrefix(h.Get("Strict-Transport-Security"), "max-age=") {
			t.Errorf("%s: headers = %v", path, h)
		}
	}
}

// Host ที่ client ส่งมาถูกนำไปใส่ CSP จึงต้องไม่มีทางแทรก directive เพิ่มได้
func TestCSPIgnoresHostileHost(t *testing.T) {
	s := newProtectedServer(t, hub.Config{}, nil)
	req, _ := http.NewRequest(http.MethodGet, s.URL+"/healthz", nil)
	req.Host = "evil.example;script-src *"
	resp, err := s.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if csp := resp.Header.Get("Content-Security-Policy"); strings.Contains(csp, "evil") || strings.Contains(csp, "script-src *") {
		t.Fatalf("hostile Host leaked into CSP: %q", csp)
	}
}

func TestWebSocketConnectionLimitPerIP(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MaxConnsPerIP: 2, AuthTimeout: 5 * time.Second}, nil)
	a, err := s.dial(nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.dial(nil); err != nil {
		t.Fatal(err)
	}
	// connection ที่ยังไม่ได้ auth ก็นับ: เส้นที่สามถูกปฏิเสธตั้งแต่ก่อน upgrade
	ctx, cancel := context.WithTimeout(context.Background(), e2eTimeout)
	defer cancel()
	_, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(s.URL, "http")+"/ws", nil)
	if err == nil || resp == nil || resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("3rd connection: err=%v resp=%v, want 429", err, resp)
	}

	// ปิดหนึ่งเส้นแล้วเปิดใหม่ได้
	_ = a.conn.Close(websocket.StatusNormalClosure, "")
	deadline := time.Now().Add(e2eTimeout)
	for {
		c, err := s.dial(nil)
		if err == nil {
			_ = c.conn.CloseNow()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("slot was not released after close: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestWebSocketConnectionLimitPerUser(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MaxConnsPerUser: 2}, nil)
	_, a := s.newGuest()
	_, b := s.newGuest()
	s.connect(a)
	s.connect(a)

	third, err := s.dial(nil)
	if err != nil {
		t.Fatal(err)
	}
	third.send(map[string]any{"type": "auth", "token": a})
	third.expectError("too_many_connections")
	third.expectClosed("connection over the per-user limit")

	s.connect(b) // อีกคนไม่ถูกกระทบ
}

func TestWebSocketMessageRateLimit(t *testing.T) {
	s := newProtectedServer(t, hub.Config{MessageRate: ratelimit.Rule{Every: slow, Burst: 5}}, nil)
	_, a := s.newGuest()
	room := s.newRoom(a)
	c := s.connect(a)
	c.send(map[string]any{"type": "join", "room": room}) // ข้อความที่ 1
	c.until("state", func(m msg) bool { return m.Type == "state" })

	// ข้อความที่ 2–5 ยังอยู่ในโควตา (ถูกปฏิเสธด้วยเหตุผลอื่น) ข้อความถัดไปถูกทิ้งด้วย rate_limited
	for range 4 {
		c.send(map[string]any{"type": "resign"})
	}
	c.send(map[string]any{"type": "chat", "text": "over the limit"})
	c.expectError("rate_limited")

	// ข้อความที่ถูกทิ้งต้องไม่มีผล: แชทนั้นต้องไม่ถูกส่งออก
	other := s.connect(a)
	other.send(map[string]any{"type": "join", "room": room})
	m := other.until("state or chat", func(m msg) bool { return m.Type == "state" || m.Type == "chat_history" })
	if m.Type == "chat_history" {
		t.Fatal("a rate-limited chat message was delivered")
	}

	// ส่งรัวต่อไปเรื่อย ๆ จะถูกตัดการเชื่อมต่อ
	for range 40 {
		c.sendRaw(`{"type":"resign"}`)
	}
	c.expectClosed("connection that keeps flooding")
}

func TestChatReport(t *testing.T) {
	var mu sync.Mutex
	var got []hub.ChatReport
	s := newProtectedServer(t, hub.Config{OnReport: func(r hub.ChatReport) {
		mu.Lock()
		got = append(got, r)
		mu.Unlock()
	}}, nil)
	aliceUser, alice := s.newGuest()
	bobUser, bob := s.newGuest()
	room := s.newRoom(alice)
	a, b := s.connect(alice), s.connect(bob)
	a.send(map[string]any{"type": "join", "room": room})
	b.send(map[string]any{"type": "join", "room": room})
	b.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })

	a.send(map[string]any{"type": "chat", "text": "rude words"})
	chat := b.until("chat", func(m msg) bool { return m.Type == "chat" })
	if chat.Sender == "" || chat.ID != 1 {
		t.Fatalf("chat = %+v, want id 1 with a sender label", chat)
	}

	// client พยายามใส่ข้อมูลเองไม่ได้
	b.sendRaw(`{"type":"report","id":1,"text":"something else"}`)
	b.expectError("bad_message")
	b.sendRaw(`{"type":"report","id":0}`)
	b.expectError("bad_message")
	b.sendRaw(`{"type":"report"}`)
	b.expectError("bad_message")

	b.send(map[string]any{"type": "report", "id": 1})
	b.until("report_ok", func(m msg) bool { return m.Type == "report_ok" && m.ID == 1 })
	b.send(map[string]any{"type": "report", "id": 1}) // ซ้ำ: ตอบรับแต่ไม่บันทึกอีก
	b.until("second report_ok", func(m msg) bool { return m.Type == "report_ok" })

	// รายงานข้อความของตัวเอง และข้อความที่ไม่มี: ไม่เกิดอะไร
	a.send(map[string]any{"type": "report", "id": 1})
	a.send(map[string]any{"type": "report", "id": 999})
	a.send(map[string]any{"type": "chat", "text": "marker"})
	a.until("marker", func(m msg) bool {
		if m.Type == "report_ok" {
			t.Fatalf("self/unknown report was accepted: %+v", m)
		}
		return m.Type == "chat"
	})

	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 {
		t.Fatalf("%d reports recorded, want 1: %+v", len(got), got)
	}
	r := got[0]
	if r.RoomID != room || r.MessageID != 1 || r.Text != "rude words" || r.SenderID != aliceUser || r.ReporterID != bobUser {
		t.Fatalf("report = %+v", r)
	}
}

func TestChatReportRateLimit(t *testing.T) {
	n := 0
	var mu sync.Mutex
	s := newProtectedServer(t, hub.Config{OnReport: func(hub.ChatReport) {
		mu.Lock()
		n++
		mu.Unlock()
	}}, nil)
	_, alice := s.newGuest()
	_, bob := s.newGuest()
	room := s.newRoom(alice)
	a, b := s.connect(alice), s.connect(bob)
	a.send(map[string]any{"type": "join", "room": room})
	b.send(map[string]any{"type": "join", "room": room})
	b.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })

	for i := range 4 {
		a.send(map[string]any{"type": "chat", "text": "message"})
		b.until("chat", func(m msg) bool { return m.Type == "chat" && m.ID == i+1 })
	}
	for id := 1; id <= 3; id++ {
		b.send(map[string]any{"type": "report", "id": id})
		b.until("report_ok", func(m msg) bool { return m.Type == "report_ok" && m.ID == id })
	}
	b.send(map[string]any{"type": "report", "id": 4})
	b.expectError("rate_limited")

	mu.Lock()
	defer mu.Unlock()
	if n != 3 {
		t.Fatalf("%d reports recorded, want 3", n)
	}
}

// TestJoinAttemptsAreLimitedPerIP: การไล่เดารหัสห้องถูกหยุดหลังครบโควตา และหลังจากนั้นไม่บอกแล้วว่าห้องมีอยู่หรือไม่
func TestJoinAttemptsAreLimitedPerIP(t *testing.T) {
	s := newTestServer(t, hub.Config{JoinRate: ratelimit.Rule{Every: time.Hour, Burst: 3}})
	_, token := s.newGuest()
	real := s.newRoom(token)

	c := s.connect(token)
	for i := range 3 {
		c.send(map[string]string{"type": "join", "room": "100000"})
		if got := c.until("answer", func(m msg) bool { return m.Type == "error" }); got.Code != "room_not_found" {
			t.Fatalf("guess %d: %q, want room_not_found", i+1, got.Code)
		}
	}
	// ครบโควตาแล้ว: แม้แต่รหัสที่ถูกก็ไม่ได้เข้า และคำตอบไม่บอกว่าห้องมีอยู่
	for _, room := range []string{"100000", real} {
		c.send(map[string]string{"type": "join", "room": room})
		if got := c.until("answer", func(m msg) bool { return m.Type == "error" || m.Type == "state" }); got.Type != "error" || got.Code != "rate_limited" {
			t.Fatalf("join %s after the quota: %+v, want rate_limited", room, got)
		}
	}
	// เปิด connection ใหม่จาก IP เดิมก็ยังถูกจำกัด
	again := s.connect(token)
	again.send(map[string]string{"type": "join", "room": real})
	if got := again.until("answer", func(m msg) bool { return m.Type == "error" || m.Type == "state" }); got.Code != "rate_limited" {
		t.Fatalf("new connection from the same address: %+v, want rate_limited", got)
	}
}
