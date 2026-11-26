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
	"strconv"
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
	adminToken  = "mail:Boss@Example.com" // ตัวพิมพ์ต่างจากใน ADMIN_EMAILS
	secondToken = "mail:second@example.com"
	otherToken  = "mail:someone@example.com"
	opsPath     = "/api/admin/credits/ops"
	imagePath   = "/api/admin/credits/ocs/kaimuk/image"
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

// call ส่งคำขอและคืนสถานะกับ body ที่ถอดเป็น map (body ดิบอยู่ที่ key "_raw")
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

func (s *adminServer) send(method, path, token, body string) (int, map[string]any) {
	s.t.Helper()
	status, out, _ := s.call(method, path, token, "application/json", []byte(body))
	return status, out
}

// list คืนรายการของชนิด kind จาก response
func list(body map[string]any, kind string) []any {
	credits, _ := body["credits"].(map[string]any)
	out, _ := credits[kind].([]any)
	return out
}

// item คืนรายการที่ตำแหน่ง i ของชนิด kind จาก response (map ว่างถ้าไม่มี)
func item(body map[string]any, kind string, i int) map[string]any {
	if l := list(body, kind); i < len(l) {
		if out, ok := l[i].(map[string]any); ok {
			return out
		}
	}
	return map[string]any{}
}

const creditsJSON = "{" +
	"\"people\": [{\"id\":\"nok\",\"name\":\"Nok\",\"handle\":\"@nok\",\"link\":\"https://example.com/nok\",\"bg\":\"#FFB8CC\"}," +
	"{\"id\":\"mew\",\"name\":\"Mew\",\"handle\":\"\",\"link\":\"\",\"bg\":\"#9FE3C9\"}]," +
	"\"team\": [{\"role\":\"Developer\",\"bg\":\"#A9D6F7\",\"ids\":[\"nok\"]}]," +
	"\"ocs\": [{\"id\":\"kaimuk\",\"name\":\"ไข่มุก\",\"title\":\"ราชินี\",\"owner\":\"nok\",\"artist\":\"nok\",\"color\":\"#FF8FB1\",\"pale\":\"#FFE8EF\",\"bio\":\"ชอบกินขนม\",\"image\":\"\"}]" +
	"}"

func (s *adminServer) init() {
	s.t.Helper()
	if status, body := s.send(http.MethodPut, "/api/admin/credits", adminToken, creditsJSON); status != http.StatusOK {
		s.t.Fatalf("init credits: %d %v", status, body["_raw"])
	}
}

func savePerson(id string, rev int, name string) string {
	return "{\"op\":\"save\",\"kind\":\"people\",\"id\":\"" + id + "\",\"rev\":" + strconv.Itoa(rev) +
		",\"person\":{\"name\":\"" + name + "\",\"handle\":\"\",\"link\":\"\",\"bg\":\"#FFB8CC\"}}"
}

func sizedPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestAdminMe(t *testing.T) {
	s := newAdminServer(t, " boss@example.com ", "second@example.com")
	for token, want := range map[string]bool{
		adminToken:  true, // เทียบอีเมลแบบไม่สนตัวพิมพ์
		secondToken: true,
		otherToken:  false,
		"mail:":     false, // บัญชีที่ไม่มีอีเมล
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
	if status, _ := s.send(http.MethodPut, "/api/admin/credits", adminToken, creditsJSON); status != http.StatusForbidden {
		t.Fatalf("save without any admin configured: %d, want 403", status)
	}
}

func TestOnlyAdminsCanChangeCredits(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	status, body, _ := s.call(http.MethodGet, "/api/credits", "", "", nil)
	if status != http.StatusOK || body["credits"] != nil {
		t.Fatalf("credits before any save: %d %v, want null", status, body["_raw"])
	}
	s.init()

	_, guestToken := s.newGuest()
	writes := []struct{ method, path, ctype, body string }{
		{http.MethodPut, "/api/admin/credits", "application/json", creditsJSON},
		{http.MethodPost, opsPath, "application/json", "{\"op\":\"delete\",\"kind\":\"ocs\",\"id\":\"kaimuk\",\"rev\":1}"},
		{http.MethodPost, opsPath, "application/json", "{\"op\":\"create\",\"kind\":\"people\"}"},
		{http.MethodPut, imagePath + "?rev=1", "image/png", string(sizedPNG(t, 8, 8))},
		{http.MethodDelete, imagePath + "?rev=1", "", ""},
	}
	for name, token := range map[string]string{"no token": "", "guest": guestToken, "other account": otherToken, "account without email": "mail:"} {
		want := http.StatusForbidden
		if token == "" {
			want = http.StatusUnauthorized
		}
		for _, w := range writes {
			if status, _, _ := s.call(w.method, w.path, token, w.ctype, []byte(w.body)); status != want {
				t.Errorf("%s %s %s: %d, want %d", name, w.method, w.path, status, want)
			}
		}
	}
	c, _ := s.store.Credits(context.Background())
	if c == nil || len(c.People) != 2 || len(c.Ocs) != 1 || c.Ocs[0].Rev != 1 || s.store.ImageCount() != 0 {
		t.Fatalf("a non-admin request changed something: %+v images=%d", c, s.store.ImageCount())
	}

	// ทุกคนอ่านได้โดยไม่ต้อง login
	status, body, _ = s.call(http.MethodGet, "/api/credits", "", "", nil)
	if status != http.StatusOK || item(body, "ocs", 0)["name"] != "ไข่มุก" {
		t.Fatalf("public credits: %d %v", status, body["_raw"])
	}
}

func TestInitOnlyOnce(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	// ยังไม่ตั้งต้น: แก้รายการไม่ได้
	if status, body := s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"create\",\"kind\":\"people\"}"); status != http.StatusConflict || body["error"] != "not_created" {
		t.Fatalf("op before init: %d %v", status, body["_raw"])
	}
	for name, payload := range map[string]string{
		"not json":      "{",
		"unknown field": strings.Replace(creditsJSON, "\"people\"", "\"extra\":1,\"people\"", 1),
		"script link":   strings.Replace(creditsJSON, "https://example.com/nok", "javascript:alert(1)", 1),
		"with an image": strings.Replace(creditsJSON, "\"image\":\"\"", "\"image\":\"/api/content-images/0123456789abcdef0123456789abcdef\"", 1),
		"huge":          "{\"people\":[],\"team\":[],\"ocs\":[],\"pad\":\"" + strings.Repeat("x", content.MaxCreditsBytes) + "\"}",
	} {
		if status, _ := s.send(http.MethodPut, "/api/admin/credits", adminToken, payload); status != http.StatusBadRequest {
			t.Errorf("init with %s: %d, want 400", name, status)
		}
	}
	if c, _ := s.store.Credits(context.Background()); c != nil {
		t.Fatalf("an invalid init was stored: %+v", c)
	}
	s.init()
	status, body := s.send(http.MethodPut, "/api/admin/credits", adminToken, "{\"people\":[],\"team\":[],\"ocs\":[]}")
	if status != http.StatusConflict || body["error"] != "exists" || item(body, "people", 0)["name"] != "Nok" {
		t.Fatalf("second init: %d %v, want 409 exists with the current data", status, body["_raw"])
	}
}

func TestEditingOneItemAtATime(t *testing.T) {
	s := newAdminServer(t, "boss@example.com", "second@example.com")
	s.init()

	// admin คนแรกบันทึก nok
	status, body := s.send(http.MethodPost, opsPath, adminToken, savePerson("nok", 1, "นกจริง"))
	if status != http.StatusOK || item(body, "people", 0)["name"] != "นกจริง" || item(body, "people", 0)["rev"] != float64(2) {
		t.Fatalf("first save: %d %v", status, body["_raw"])
	}
	// admin คนที่สองเปิดหน้าไว้ก่อนหน้านั้น (ยังถือรุ่น 1) บันทึกรายการเดียวกันไม่ได้
	status, body = s.send(http.MethodPost, opsPath, secondToken, savePerson("nok", 1, "ทับ"))
	if status != http.StatusConflict || body["error"] != "conflict" {
		t.Fatalf("stale save of the same item: %d %v, want 409 conflict", status, body["_raw"])
	}
	// และได้ค่าล่าสุดกลับไปด้วย
	if item(body, "people", 0)["name"] != "นกจริง" {
		t.Fatalf("the conflict response does not carry the current data: %v", body["_raw"])
	}
	// แต่แก้รายการอื่นได้ตามปกติ และไม่กระทบรายการของคนแรก
	status, body = s.send(http.MethodPost, opsPath, secondToken, savePerson("mew", 1, "เหมียว"))
	if status != http.StatusOK || item(body, "people", 1)["name"] != "เหมียว" || item(body, "people", 0)["name"] != "นกจริง" {
		t.Fatalf("saving a different item: %d %v", status, body["_raw"])
	}
	// หลังรับค่าล่าสุดแล้ว (รุ่น 2) จึงบันทึกได้
	if status, body := s.send(http.MethodPost, opsPath, secondToken, savePerson("nok", 2, "นกสอง")); status != http.StatusOK {
		t.Fatalf("save with the fresh rev: %d %v", status, body["_raw"])
	}

	// คนที่ยังเป็นเจ้าของตัวละครลบไม่ได้
	status, body = s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"delete\",\"kind\":\"people\",\"id\":\"nok\",\"rev\":3}")
	if status != http.StatusConflict || body["error"] != "in_use" {
		t.Fatalf("delete an owner: %d %v", status, body["_raw"])
	}
	// ข้อมูลผิดบอกช่องที่ผิด
	status, body = s.send(http.MethodPost, opsPath, adminToken,
		"{\"op\":\"save\",\"kind\":\"ocs\",\"id\":\"kaimuk\",\"rev\":1,\"oc\":{\"name\":\"x\",\"owner\":\"ghost\",\"artist\":\"nok\",\"color\":\"#FF8FB1\",\"pale\":\"#FFE8EF\"}}")
	if status != http.StatusBadRequest || body["error"] != "bad_credits" || body["field"] != "ocs[0].owner" {
		t.Fatalf("unknown owner: %d %v", status, body["_raw"])
	}
	for name, payload := range map[string]string{
		"not json":      "{",
		"unknown field": "{\"op\":\"create\",\"kind\":\"people\",\"extra\":1}",
		"unknown op":    "{\"op\":\"explode\",\"kind\":\"people\",\"id\":\"nok\",\"rev\":3}",
		"unknown kind":  "{\"op\":\"create\",\"kind\":\"users\"}",
		"save no value": "{\"op\":\"save\",\"kind\":\"people\",\"id\":\"nok\",\"rev\":3}",
	} {
		if status, _ := s.send(http.MethodPost, opsPath, adminToken, payload); status != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, status)
		}
	}

	// เพิ่ม จัดลำดับ และลบ
	status, body = s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"create\",\"kind\":\"people\"}")
	added, _ := item(body, "people", 2)["id"].(string)
	if status != http.StatusOK || added == "" {
		t.Fatalf("create: %d %v", status, body["_raw"])
	}
	status, body = s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"order\",\"kind\":\"people\",\"ids\":[\""+added+"\",\"mew\",\"nok\"]}")
	if status != http.StatusOK || item(body, "people", 0)["id"] != added {
		t.Fatalf("order: %d %v", status, body["_raw"])
	}
	// ลำดับที่ไม่ครบ (มีคนเพิ่มรายการไปแล้ว) ถูกปฏิเสธ
	if status, body := s.send(http.MethodPost, opsPath, secondToken, "{\"op\":\"order\",\"kind\":\"people\",\"ids\":[\"mew\",\"nok\"]}"); status != http.StatusConflict {
		t.Fatalf("stale order: %d %v", status, body["_raw"])
	}
	del := "{\"op\":\"delete\",\"kind\":\"people\",\"id\":\"" + added + "\",\"rev\":1}"
	if status, body := s.send(http.MethodPost, opsPath, adminToken, del); status != http.StatusOK || len(list(body, "people")) != 2 {
		t.Fatalf("delete: %d %v", status, body["_raw"])
	}
	// ลบซ้ำ (หรือคนอื่นลบไปแล้ว) เป็น conflict
	if status, _ := s.send(http.MethodPost, opsPath, secondToken, del); status != http.StatusConflict {
		t.Fatalf("delete of a deleted item: %d, want 409", status)
	}
}

func TestCharacterImagesAreDeletedWhenReplacedOrRemoved(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	s.init()
	put := func(rev string, data []byte) (int, map[string]any) {
		status, body, _ := s.call(http.MethodPut, imagePath+"?rev="+rev, adminToken, "image/png", data)
		return status, body
	}

	status, body := put("1", sizedPNG(t, 30, 40))
	first, _ := item(body, "ocs", 0)["image"].(string)
	if status != http.StatusOK || !strings.HasPrefix(first, "/api/content-images/") || item(body, "ocs", 0)["rev"] != float64(2) {
		t.Fatalf("upload: %d %v", status, body["_raw"])
	}
	// ทุกคนเปิดรูปได้ และ header กันการรันเนื้อหา
	status, raw, header := s.call(http.MethodGet, first, "", "", nil)
	if status != http.StatusOK || header.Get("Content-Type") != "image/png" || header.Get("X-Content-Type-Options") != "nosniff" ||
		!strings.Contains(header.Get("Cache-Control"), "immutable") || !strings.HasPrefix(raw["_raw"].(string), "\x89PNG") {
		t.Fatalf("serve image: %d %v", status, header)
	}

	// เปลี่ยนรูป: รูปเก่าต้องหายจากที่เก็บและเปิดไม่ได้อีก
	status, body = put("2", sizedPNG(t, 20, 20))
	second, _ := item(body, "ocs", 0)["image"].(string)
	if status != http.StatusOK || second == first || s.store.ImageCount() != 1 {
		t.Fatalf("replace: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
	}
	if status, _, _ := s.call(http.MethodGet, first, "", "", nil); status != http.StatusNotFound {
		t.Fatalf("the replaced image is still served: %d", status)
	}

	// อัปโหลดด้วยเลขรุ่นเก่า (มีคนแก้ตัวละครไปก่อน): ถูกปฏิเสธ และรูปที่ส่งมาไม่ถูกเก็บค้างไว้
	if status, body := put("1", sizedPNG(t, 10, 10)); status != http.StatusConflict || body["error"] != "conflict" || s.store.ImageCount() != 1 {
		t.Fatalf("stale upload: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
	}
	// ไฟล์ที่ใช้ไม่ได้ไม่ถูกเก็บ และไม่เปลี่ยนรูปเดิม
	for name, data := range map[string][]byte{
		"html":     []byte("<html><script>alert(1)</script></html>"),
		"svg":      []byte("<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"/>"),
		"too wide": sizedPNG(t, content.MaxImageSide+1, 1),
	} {
		if status, body := put("3", data); status != http.StatusBadRequest || body["error"] != "bad_image" {
			t.Errorf("%s: %d %v", name, status, body["_raw"])
		}
	}
	if status, _ := put("3", make([]byte, content.MaxImageBytes+1)); status != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized upload: %d, want 413", status)
	}
	for _, q := range []string{"", "?rev=0", "?rev=abc"} {
		if status, _, _ := s.call(http.MethodPut, imagePath+q, adminToken, "image/png", sizedPNG(t, 4, 4)); status != http.StatusBadRequest {
			t.Errorf("upload with query %q: %d, want 400", q, status)
		}
	}
	if s.store.ImageCount() != 1 {
		t.Fatalf("%d images stored after refused uploads, want 1", s.store.ImageCount())
	}

	// เอารูปออก: รูปถูกลบ
	status, body = s.send(http.MethodDelete, imagePath+"?rev=3", adminToken, "")
	if status != http.StatusOK || item(body, "ocs", 0)["image"] != "" || s.store.ImageCount() != 0 {
		t.Fatalf("remove image: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
	}
	if status, _, _ := s.call(http.MethodGet, second, "", "", nil); status != http.StatusNotFound {
		t.Fatalf("the removed image is still served: %d", status)
	}

	// ลบตัวละครที่มีรูป: รูปถูกลบด้วย
	if status, body := put("4", sizedPNG(t, 12, 12)); status != http.StatusOK || s.store.ImageCount() != 1 {
		t.Fatalf("upload again: %d %v", status, body["_raw"])
	}
	status, body = s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"delete\",\"kind\":\"ocs\",\"id\":\"kaimuk\",\"rev\":5}")
	if status != http.StatusOK || s.store.ImageCount() != 0 {
		t.Fatalf("delete character: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
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
		status, _ := s.send(http.MethodPost, opsPath, adminToken, "{\"op\":\"create\",\"kind\":\"people\"}")
		codes = append(codes, status)
	}
	// สองคำขอแรกผ่านโควตา (ได้ 409 เพราะยังไม่ได้ตั้งต้นข้อมูล) คำขอที่สามถูกจำกัด
	if codes[0] != http.StatusConflict || codes[1] != http.StatusConflict || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("statuses = %v, want 409 409 429", codes)
	}
}

func TestPeopleCanHaveImages(t *testing.T) {
	s := newAdminServer(t, "boss@example.com")
	s.init()
	_, body, _ := s.call(http.MethodGet, "/api/credits", "", "", nil)
	credits, _ := body["credits"].(map[string]any)
	if credits == nil {
		credits = body
	}
	first, _ := credits["people"].([]any)[0].(map[string]any)
	personID, _ := first["id"].(string)
	path := "/api/admin/credits/people/" + personID + "/image"

	status, body, _ := s.call(http.MethodPut, path+"?rev=1", adminToken, "image/png", sizedPNG(t, 24, 24))
	image, _ := item(body, "people", 0)["image"].(string)
	if status != http.StatusOK || !strings.HasPrefix(image, "/api/content-images/") || item(body, "people", 0)["rev"] != float64(2) || s.store.ImageCount() != 1 {
		t.Fatalf("upload: %d %v", status, body["_raw"])
	}
	// เลขรุ่นเก่าถูกปฏิเสธ และรูปที่ส่งมาไม่ค้างในที่เก็บ
	if status, body, _ := s.call(http.MethodPut, path+"?rev=1", adminToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusConflict || body["error"] != "conflict" || s.store.ImageCount() != 1 {
		t.Fatalf("stale upload: %d images=%d", status, s.store.ImageCount())
	}
	// เอารูปออก: รูปถูกลบจากที่เก็บ
	status, body, _ = s.call(http.MethodDelete, path+"?rev=2", adminToken, "", nil)
	if status != http.StatusOK || item(body, "people", 0)["image"] != "" || s.store.ImageCount() != 0 {
		t.Fatalf("remove: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
	}
	// ชนิดอื่นไม่มีรูป
	if status, _, _ := s.call(http.MethodPut, "/api/admin/credits/team/x/image?rev=1", adminToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusBadRequest {
		t.Fatalf("team image: %d", status)
	}
}
