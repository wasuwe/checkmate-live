package ratelimit

import (
	"net/http"
	"sync"
	"testing"
	"time"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func TestLimiterBurstThenRefill(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	l := newLimiter(Rule{Every: 10 * time.Second, Burst: 3}, clock.now)

	for i := range 3 {
		if !l.Allow("a") {
			t.Fatalf("request %d inside the burst was refused", i+1)
		}
	}
	if l.Allow("a") {
		t.Fatal("request over the burst was allowed")
	}
	// key อื่นมีโควตาของตัวเอง
	if !l.Allow("b") {
		t.Fatal("another key was affected")
	}

	clock.advance(9 * time.Second)
	if l.Allow("a") {
		t.Fatal("allowed before a token was refilled")
	}
	clock.advance(time.Second)
	if !l.Allow("a") {
		t.Fatal("refused after a token was refilled")
	}
	if l.Allow("a") {
		t.Fatal("got more than one token back")
	}
}

func TestLimiterForgetsIdleKeys(t *testing.T) {
	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	l := newLimiter(Rule{Every: time.Second, Burst: 2}, clock.now)
	for _, k := range []string{"a", "b", "c"} {
		l.Allow(k)
	}
	if l.Size() != 3 {
		t.Fatalf("size = %d, want 3", l.Size())
	}
	clock.advance(3 * time.Minute)
	l.Allow("d") // การเรียกครั้งถัดไปเป็นตัวล้าง
	if l.Size() != 1 {
		t.Fatalf("size after idle = %d, want 1", l.Size())
	}
	// key ที่ถูกลืมกลับมาใหม่ได้โควตาเต็ม ซึ่งถูกต้องเพราะเวลาผ่านไปนานกว่าที่ใช้เติมจนเต็ม
	if !l.Allow("a") || !l.Allow("a") || l.Allow("a") {
		t.Fatal("a forgotten key did not start with a full burst")
	}
}

func TestNilLimiterAllowsEverything(t *testing.T) {
	var l *Limiter
	for range 100 {
		if !l.Allow("x") {
			t.Fatal("nil limiter refused")
		}
	}
}

func TestCounter(t *testing.T) {
	c := NewCounter(2)
	if !c.Acquire("a") || !c.Acquire("a") {
		t.Fatal("could not acquire up to the limit")
	}
	if c.Acquire("a") {
		t.Fatal("acquired over the limit")
	}
	if !c.Acquire("b") {
		t.Fatal("another key was affected")
	}
	c.Release("a")
	if !c.Acquire("a") {
		t.Fatal("could not acquire after a release")
	}
	c.Release("a")
	c.Release("a")
	c.Release("a") // คืนเกินต้องไม่ทำให้ติดลบ
	if c.Count("a") != 0 {
		t.Fatalf("count = %d, want 0", c.Count("a"))
	}
	if !c.Acquire("a") || !c.Acquire("a") || c.Acquire("a") {
		t.Fatal("limit changed after an extra release")
	}
}

func TestCounterConcurrent(t *testing.T) {
	c := NewCounter(10)
	var wg sync.WaitGroup
	var mu sync.Mutex
	got := 0
	for range 100 {
		wg.Go(func() {
			if c.Acquire("k") {
				mu.Lock()
				got++
				mu.Unlock()
			}
		})
	}
	wg.Wait()
	if got != 10 {
		t.Fatalf("%d acquired, want exactly 10", got)
	}
}

func TestClientIP(t *testing.T) {
	req := func(remote, header, value string) *http.Request {
		r, _ := http.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		if header != "" {
			r.Header.Set(header, value)
		}
		return r
	}
	cases := []struct {
		name    string
		r       *http.Request
		trusted string
		want    string
	}{
		{"connection address", req("203.0.113.7:5123", "", ""), "", "203.0.113.7"},
		{"header ignored when not trusted", req("203.0.113.7:5123", "Fly-Client-Ip", "198.51.100.9"), "", "203.0.113.7"},
		{"X-Forwarded-For is never used", req("203.0.113.7:5123", "X-Forwarded-For", "198.51.100.9"), "", "203.0.113.7"},
		{"trusted header", req("10.0.0.2:80", "Fly-Client-Ip", "198.51.100.9"), "Fly-Client-IP", "198.51.100.9"},
		{"garbage in trusted header falls back", req("10.0.0.2:80", "Fly-Client-Ip", "not an ip"), "Fly-Client-IP", "10.0.0.2"},
		{"missing trusted header falls back", req("10.0.0.2:80", "", ""), "Fly-Client-IP", "10.0.0.2"},
		{"ipv6 grouped by /64", req("[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:443", "", ""), "", "2001:db8:1:2::/64"},
		{"same /64, different host", req("[2001:db8:1:2::1]:443", "", ""), "", "2001:db8:1:2::/64"},
		{"ipv4-mapped ipv6", req("[::ffff:203.0.113.7]:443", "", ""), "", "203.0.113.7"},
		{"zone is dropped", req("[fe80::1%eth0]:443", "", ""), "", "fe80::/64"},
	}
	for _, c := range cases {
		if got := ClientIP(c.r, c.trusted); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
