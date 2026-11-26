package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/content"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// emailAuth เป็นตัวตรวจ token ของบัญชีใน test: token "mail:<email>" คือบัญชีที่มีอีเมลนั้น
// user ID เป็นค่าคงที่ต่ออีเมล (ตัวจริงคือ JWT ของ Supabase ที่มี claim email)
type emailAuth struct{}

func (emailAuth) Authenticate(ctx context.Context, token string) (string, error) {
	id, err := emailAuth{}.Identify(ctx, token)
	return id.UserID, err
}

func (emailAuth) Identify(_ context.Context, token string) (auth.Identity, error) {
	email, ok := strings.CutPrefix(token, "mail:")
	if !ok {
		return auth.Identity{}, auth.ErrInvalidToken
	}
	return auth.Identity{UserID: "user-" + email, Email: email}, nil
}

const (
	adminToken = "mail:Boss@Example.com" // ตัวพิมพ์ต่างจากใน ADMIN_EMAILS
	otherToken = "mail:someone@example.com"
)

type adminServer struct {
	*testServer
	store *content.Memory
}

func newAdminServer(t *testing.T, admins ...string) *adminServer {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: emailAuth{}}
	h := hub.New(hub.Config{}, authn)
	store := content.NewMemory()
	srv := httptest.NewServer(New(Config{Hub: h, Auth: authn, Guest: guest, Content: store, Admins: admins}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &adminServer{testServer: &testServer{Server: srv, t: t}, store: store}
}

// call ส่งคำขอและคืนสถานะกับ body ที่ถอดเป็น map
func (s *adminServer) call(method, path, token, contentType string, body []byte) (int, map[string]any, http.Header) {
	s.t.Helper()
	req, err := http.NewRequest(method, s.URL+path, bytes.NewReader(body))
	if err != nil {
		s.t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := s.Client().Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	out["_raw"] = string(raw)
	return resp.StatusCode, out, resp.Header
}

const creditsJSON = `{
  "people": [{"id":"nok","name":"Nok","handle":"@nok","link":"https://example.com/nok","bg":"#FFB8CC"}],
  "team": [{"role":"Developer","bg":"#A9D6F7","ids":["nok"]}],
  "ocs": [{"id":"kaimuk","name":"ไข่มุก","title":"ราชินี","owner":"nok","artist":"nok","color":"#FF8FB1","pale":"#FFE8EF","bio":"ชอบกินขนม","image":""}]
}`

func TestAdminMe(t *testing.T) {
	s := newAdminServer(t, " boss@example.com ", "second@example.com")
	for token, want := range map[string]bool{
		adminToken:                true, // เทียบอีเมลแบบไม่สนตัวพิมพ์
		"mail:second@example.com": true,
		otherToken:                false,
		"mail:":                   false, // บัญชีที่ไม่มีอีเมล
	} {
		status, body, _ := s.call(http.MethodGet, "/api/admin/me", token, "", nil)
		if status != http.StatusOK || body["admin"] != want {
			t.Errorf("%s: %d %v, want admin=%v", token, status, body["_raw"], want)
		}
	}
	_, guestToken := s.newGuest()
	if status, body, _ := s.call(http.MethodGet, "/api/admin/me", guestToken, "", nil); status != http.StatusOK || body["admin"] != false {
		t.Errorf("guest: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodGet, "/api/admin/me", "", "", nil); status != http.StatusUnauthorized {
		t.Errorf("no token: %d, want 401", status)
	}
	if status, _, _ := s.call(http.MethodGet, "/api/admin/me", "garbage", "", nil); status != http.StatusUnauthorized {
		t.Errorf("bad token: %d, want 401", status)
	}
}

func TestNoAdminsMeansNobodyCanEdit(t *testing.T) {
	s := newAdminServer(t) // ไม่ได้ตั้ง ADMIN_EMAILS
	if status, body, _ := s.call(http.MethodGet, "/api/admin/me", adminToken, "", nil); status != http.StatusOK || body["admin"] != false {
		t.Fatalf("me: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(creditsJSON)); status != http.StatusForbidden {
		t.Fatalf("save without any admin configured: %d, want 403", status)
	}
}

func TestOnlyAdminsCanChangeCredits(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")

	status, body, _ := s.call(http.MethodGet, "/api/credits", "", "", nil)
	if status != http.StatusOK || body["credits"] != nil {
		t.Fatalf("credits before any save: %d %v, want null", status, body["_raw"])
	}

	_, guestToken := s.newGuest()
	for name, token := range map[string]string{"no token": "", "guest": guestToken, "other account": otherToken, "account without email": "mail:"} {
		want := http.StatusForbidden
		if token == "" {
			want = http.StatusUnauthorized
		}
		if status, _, _ := s.call(http.MethodPut, "/api/admin/credits", token, "application/json", []byte(creditsJSON)); status != want {
			t.Errorf("%s saving credits: %d, want %d", name, status, want)
		}
		if status, _, _ := s.call(http.MethodPost, "/api/admin/images", token, "image/png", sizedPNG(t, 8, 8)); status != want {
			t.Errorf("%s uploading an image: %d, want %d", name, status, want)
		}
	}
	if c, _ := s.store.Credits(context.Background()); c != nil {
		t.Fatalf("a non-admin request changed the credits: %+v", c)
	}

	status, body, _ = s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(creditsJSON))
	if status != http.StatusOK {
		t.Fatalf("admin save: %d %v", status, body["_raw"])
	}
	// ทุกคนอ่านได้โดยไม่ต้อง login
	status, body, _ = s.call(http.MethodGet, "/api/credits", "", "", nil)
	credits, _ := body["credits"].(map[string]any)
	if status != http.StatusOK || credits == nil || len(credits["ocs"].([]any)) != 1 {
		t.Fatalf("public credits after save: %d %v", status, body["_raw"])
	}
}

func TestSaveCreditsValidation(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	bad := strings.Replace(creditsJSON, `"owner":"nok"`, `"owner":"ghost"`, 1)
	status, body, _ := s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(bad))
	if status != http.StatusBadRequest || body["error"] != "bad_credits" || body["field"] != "ocs[0].owner" {
		t.Fatalf("unknown owner: %d %v", status, body["_raw"])
	}
	for name, payload := range map[string]string{
		"not json":      "{",
		"unknown field": strings.Replace(creditsJSON, `"people"`, `"extra":1,"people"`, 1),
		"script link":   strings.Replace(creditsJSON, "https://example.com/nok", "javascript:alert(1)", 1),
		"outside image": strings.Replace(creditsJSON, `"image":""`, `"image":"https://evil.example/x.png"`, 1),
		"huge":          `{"people":[],"team":[],"ocs":[],"pad":"` + strings.Repeat("x", content.MaxCreditsBytes) + `"}`,
	} {
		if status, _, _ := s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(payload)); status != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, status)
		}
	}
	if c, _ := s.store.Credits(context.Background()); c != nil {
		t.Fatalf("an invalid save was stored: %+v", c)
	}
}

func sizedPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestContentImages(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	status, body, _ := s.call(http.MethodPost, "/api/admin/images", adminToken, "image/png", sizedPNG(t, 30, 40))
	url, _ := body["url"].(string)
	if status != http.StatusCreated || !strings.HasPrefix(url, "/api/content-images/") {
		t.Fatalf("upload: %d %v", status, body["_raw"])
	}

	// รูปที่อัปโหลดใช้ในข้อมูลเครดิตได้
	withImage := strings.Replace(creditsJSON, `"image":""`, `"image":"`+url+`"`, 1)
	if status, body, _ := s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(withImage)); status != http.StatusOK {
		t.Fatalf("save with image: %d %v", status, body["_raw"])
	}

	// ทุกคนเปิดรูปได้ และ header กันการรันเนื้อหา
	status, body, header := s.call(http.MethodGet, url, "", "", nil)
	if status != http.StatusOK || header.Get("Content-Type") != "image/png" ||
		header.Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(header.Get("Cache-Control"), "immutable") {
		t.Fatalf("serve image: %d %v", status, header)
	}
	if !strings.HasPrefix(body["_raw"].(string), "\x89PNG") {
		t.Fatal("served body is not a PNG")
	}

	for name, data := range map[string][]byte{
		"html":     []byte("<html><script>alert(1)</script></html>"),
		"svg":      []byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`),
		"too wide": sizedPNG(t, content.MaxImageSide+1, 1),
	} {
		if status, body, _ := s.call(http.MethodPost, "/api/admin/images", adminToken, "image/png", data); status != http.StatusBadRequest || body["error"] != "bad_image" {
			t.Errorf("%s: %d %v", name, status, body["_raw"])
		}
	}
	if status, _, _ := s.call(http.MethodPost, "/api/admin/images", adminToken, "image/png", make([]byte, content.MaxImageBytes+1)); status != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized upload: %d, want 413", status)
	}
	for _, path := range []string{"/api/content-images/nope", "/api/content-images/" + strings.Repeat("0", 32)} {
		if status, _, _ := s.call(http.MethodGet, path, "", "", nil); status != http.StatusNotFound {
			t.Errorf("GET %s: %d, want 404", path, status)
		}
	}
}

func TestAdminRoutesAreRateLimited(t *testing.T) {
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: emailAuth{}}
	h := hub.New(hub.Config{}, authn)
	limits := DefaultLimits
	limits.Admin.Burst = 2
	srv := httptest.NewServer(New(Config{Hub: h, Auth: authn, Content: content.NewMemory(), Admins: []string{"boss@example.com"}, Limits: &limits}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	s := &adminServer{testServer: &testServer{Server: srv, t: t}}
	codes := []int{}
	for range 3 {
		status, _, _ := s.call(http.MethodPut, "/api/admin/credits", adminToken, "application/json", []byte(creditsJSON))
		codes = append(codes, status)
	}
	if codes[0] != 200 || codes[1] != 200 || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("statuses = %v, want 200 200 429", codes)
	}
}
