package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
)

const (
	aliceID = "11111111-1111-4111-8111-111111111111"
	bobID   = "22222222-2222-4222-8222-222222222222"
)

// accountAuth เป็นตัวตรวจ token ของบัญชีใน test: token "acct:<uuid>" คือผู้ใช้ <uuid>
type accountAuth struct{}

func (accountAuth) Authenticate(_ context.Context, token string) (string, error) {
	id, ok := strings.CutPrefix(token, "acct:")
	if !ok || len(id) != 36 {
		return "", auth.ErrInvalidToken
	}
	return id, nil
}

func newProfileServer(t *testing.T) *testServer {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: accountAuth{}}
	profiles := profile.NewMemory()
	h := hub.New(hub.Config{
		CoinFlip: func() bool { return false },
		Profiles: func(ctx context.Context, userID string) hub.PlayerProfile {
			p, _ := profiles.Get(ctx, userID)
			return hub.PlayerProfile{Name: p.Name, Avatar: p.AvatarID}
		},
	}, authn)
	srv := httptest.NewServer(New(Config{Hub: h, Auth: authn, Guest: guest, Profiles: profiles}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &testServer{Server: srv, t: t}
}

// call ส่งคำขอและคืน status, header และ body
func (s *testServer) call(method, path, token string, body []byte) (int, http.Header, []byte) {
	s.t.Helper()
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(body))
	if err != nil {
		s.t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, data
}

func (s *testServer) profileCall(method, path, token string, body []byte) (int, profile.Profile, string) {
	s.t.Helper()
	status, _, data := s.call(method, path, token, body)
	var p profile.Profile
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(data, &p)
	_ = json.Unmarshal(data, &e)
	return status, p, e.Error
}

func testPNG(t *testing.T, side int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, side, side))
	for i := range side {
		img.Set(i, i, color.RGBA{R: 200, A: 255})
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestProfileRequiresAccount(t *testing.T) {
	s := newProfileServer(t)
	_, guestToken := s.newGuest()

	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/api/profile"},
		{http.MethodPut, "/api/profile"},
		{http.MethodPut, "/api/profile/avatar"},
		{http.MethodDelete, "/api/profile/avatar"},
	} {
		if status, _, code := s.profileCall(c.method, c.path, "", nil); status != http.StatusUnauthorized || code != "unauthorized" {
			t.Errorf("%s %s without token = %d %q", c.method, c.path, status, code)
		}
		if status, _, _ := s.profileCall(c.method, c.path, "acct:forged", nil); status != http.StatusUnauthorized {
			t.Errorf("%s %s with bad token = %d", c.method, c.path, status)
		}
		if status, _, code := s.profileCall(c.method, c.path, guestToken, nil); status != http.StatusForbidden || code != "account_required" {
			t.Errorf("%s %s as guest = %d %q", c.method, c.path, status, code)
		}
	}
}

func TestProfileName(t *testing.T) {
	s := newProfileServer(t)
	alice, bob := "acct:"+aliceID, "acct:"+bobID

	if status, p, _ := s.profileCall(http.MethodGet, "/api/profile", alice, nil); status != http.StatusOK || p != (profile.Profile{}) {
		t.Fatalf("new account profile = %d %+v", status, p)
	}
	status, p, _ := s.profileCall(http.MethodPut, "/api/profile", alice, []byte(`{"name":"  น้ำผึ้ง   99 "}`))
	if status != http.StatusOK || p.Name != "น้ำผึ้ง 99" {
		t.Fatalf("set name = %d %+v", status, p)
	}
	if _, p, _ := s.profileCall(http.MethodGet, "/api/profile", alice, nil); p.Name != "น้ำผึ้ง 99" {
		t.Fatalf("name not stored: %+v", p)
	}
	// โปรไฟล์ของคนอื่นไม่ถูกแตะ
	if _, p, _ := s.profileCall(http.MethodGet, "/api/profile", bob, nil); p != (profile.Profile{}) {
		t.Fatalf("bob sees %+v", p)
	}

	bad := map[string]string{
		`{"name":"ab"}`: "bad_name",
		`{"name":"<img src=x onerror=alert(1)>"}`:    "bad_name",
		`{"name":"` + strings.Repeat("a", 21) + `"}`: "bad_name",
		`{"name":"okname","userId":"` + bobID + `"}`: "bad_request", // เปลี่ยนโปรไฟล์คนอื่นผ่าน body ไม่ได้
		`{}`:           "bad_request",
		`{"name":123}`: "bad_request",
		`not json`:     "bad_request",
		`{"name":"` + strings.Repeat("a", 600) + `"}`: "bad_request", // body ใหญ่เกิน
	}
	for body, want := range bad {
		if status, _, code := s.profileCall(http.MethodPut, "/api/profile", alice, []byte(body)); status != http.StatusBadRequest || code != want {
			t.Errorf("PUT %.40s = %d %q, want 400 %q", body, status, code, want)
		}
	}
	if _, p, _ := s.profileCall(http.MethodGet, "/api/profile", alice, nil); p.Name != "น้ำผึ้ง 99" {
		t.Fatalf("rejected update changed the name: %+v", p)
	}

	if status, p, _ := s.profileCall(http.MethodPut, "/api/profile", alice, []byte(`{"name":""}`)); status != http.StatusOK || p.Name != "" {
		t.Fatalf("clear name = %d %+v", status, p)
	}
}

func TestProfileAvatar(t *testing.T) {
	s := newProfileServer(t)
	alice := "acct:" + aliceID

	status, p, _ := s.profileCall(http.MethodPut, "/api/profile/avatar", alice, testPNG(t, 64))
	if status != http.StatusOK || !profile.ValidAvatarID(p.AvatarID) {
		t.Fatalf("upload = %d %+v", status, p)
	}
	first := p.AvatarID

	// รูปเปิดดูได้โดยไม่ต้อง login และมี header ที่กันการตีความเป็นอย่างอื่น
	status, header, data := s.call(http.MethodGet, "/api/avatars/"+first, "", nil)
	if status != http.StatusOK || header.Get("Content-Type") != "image/png" {
		t.Fatalf("GET avatar = %d %q", status, header.Get("Content-Type"))
	}
	if header.Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(header.Get("Cache-Control"), "immutable") ||
		!strings.Contains(header.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Errorf("avatar headers = %v", header)
	}
	if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil || cfg.Width != 64 {
		t.Fatalf("served avatar is not the uploaded image: %v %v", cfg, err)
	}

	// อัปโหลดใหม่ได้รหัสใหม่ รหัสเก่าใช้ไม่ได้
	_, p, _ = s.profileCall(http.MethodPut, "/api/profile/avatar", alice, testPNG(t, 32))
	if p.AvatarID == first || p.AvatarID == "" {
		t.Fatalf("second upload id = %q (first %q)", p.AvatarID, first)
	}
	if status, _, _ := s.call(http.MethodGet, "/api/avatars/"+first, "", nil); status != http.StatusNotFound {
		t.Errorf("old avatar = %d, want 404", status)
	}

	rejected := map[string][]byte{
		"svg":       []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
		"html":      []byte(`<!doctype html><script>alert(1)</script>`),
		"empty":     nil,
		"oversized": testPNG(t, profile.MaxAvatarSide+1),
	}
	for name, body := range rejected {
		if status, _, code := s.profileCall(http.MethodPut, "/api/profile/avatar", alice, body); status != http.StatusBadRequest || code != "bad_image" {
			t.Errorf("upload %s = %d %q", name, status, code)
		}
	}
	huge := make([]byte, profile.MaxAvatarBytes+1)
	if status, _, code := s.profileCall(http.MethodPut, "/api/profile/avatar", alice, huge); status != http.StatusRequestEntityTooLarge || code != "image_too_large" {
		t.Errorf("huge upload = %d %q", status, code)
	}
	if _, after, _ := s.profileCall(http.MethodGet, "/api/profile", alice, nil); after.AvatarID != p.AvatarID {
		t.Fatalf("rejected upload replaced the avatar")
	}

	for _, bad := range []string{"nope", strings.Repeat("0", 32), "..%2F..%2Fetc%2Fpasswd"} {
		if status, _, _ := s.call(http.MethodGet, "/api/avatars/"+bad, "", nil); status != http.StatusNotFound {
			t.Errorf("GET /api/avatars/%s = %d, want 404", bad, status)
		}
	}

	if status, after, _ := s.profileCall(http.MethodDelete, "/api/profile/avatar", alice, nil); status != http.StatusOK || after.AvatarID != "" {
		t.Fatalf("delete = %d %+v", status, after)
	}
	if status, _, _ := s.call(http.MethodGet, "/api/avatars/"+p.AvatarID, "", nil); status != http.StatusNotFound {
		t.Errorf("deleted avatar = %d, want 404", status)
	}
}

// ชื่อและรูปต้องไปถึงทุกคนในห้องผ่าน state และ guest ต้องถูกบอกว่าเป็น guest
func TestProfileShownInRoom(t *testing.T) {
	s := newProfileServer(t)
	alice := "acct:" + aliceID
	_, guestToken := s.newGuest()

	s.profileCall(http.MethodPut, "/api/profile", alice, []byte(`{"name":"Alice"}`))
	_, p, _ := s.profileCall(http.MethodPut, "/api/profile/avatar", alice, testPNG(t, 16))

	room := s.newRoom(alice)
	a := s.connect(alice)
	a.send(map[string]any{"type": "join", "room": room})
	g := s.connect(guestToken)
	g.send(map[string]any{"type": "join", "room": room})

	for _, c := range []*wsClient{a, g} {
		m := c.until("playing state", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
		white, black := m.Players["w"], m.Players["b"]
		if white.Name != "Alice" || white.Avatar != p.AvatarID || white.Guest {
			t.Errorf("white = %+v, want Alice with avatar %s", white, p.AvatarID)
		}
		if black.Name != "" || black.Avatar != "" || !black.Guest {
			t.Errorf("black = %+v, want an unnamed guest", black)
		}
	}
}
