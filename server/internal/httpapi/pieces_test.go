package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/content"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

const artistToken = "mail:Artist@Example.com"

func newPieceServer(t *testing.T) *adminServer {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: emailAuth{}}
	h := hub.New(hub.Config{}, authn)
	store := content.NewMemory()
	srv := httptest.NewServer(New(Config{
		Hub: h, Auth: authn, Guest: guest, Content: store,
		Admins: []string{"boss@example.com"}, PieceEditors: []string{"artist@example.com"},
	}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &adminServer{testServer: &testServer{Server: srv, t: t}, store: store}
}

func styleAt(body map[string]any, i int) map[string]any {
	list, _ := body["styles"].([]any)
	if i >= len(list) {
		return map[string]any{}
	}
	m, _ := list[i].(map[string]any)
	return m
}

func TestPieceEditorRoleIsSeparateFromAdmin(t *testing.T) {
	s := newPieceServer(t)
	for token, want := range map[string][2]bool{
		adminToken:  {true, false},
		artistToken: {false, true},
		otherToken:  {false, false},
	} {
		status, body, _ := s.call(http.MethodGet, "/api/admin/me", token, "", nil)
		if status != http.StatusOK || body["admin"] != want[0] || body["pieces"] != want[1] {
			t.Fatalf("%s: %d %v", token, status, body["_raw"])
		}
	}
	// admin ที่ไม่มีบทบาทนี้ ผู้ใช้ทั่วไป และคนที่ไม่ login เพิ่มรูปแบบไม่ได้
	for token, want := range map[string]int{adminToken: http.StatusForbidden, otherToken: http.StatusForbidden, "": http.StatusUnauthorized} {
		if status, _, _ := s.call(http.MethodPost, "/api/pieces/styles", token, "application/json", []byte(`{"name":"x"}`)); status != want {
			t.Fatalf("create as %q: %d, want %d", token, status, want)
		}
	}
	// ผู้จัดการรูปแบบหมากแก้หน้าเครดิตไม่ได้
	if status, _, _ := s.call(http.MethodPut, "/api/admin/credits", artistToken, "application/json", []byte(creditsJSON)); status != http.StatusForbidden {
		t.Fatalf("piece editor edited credits: %d", status)
	}
}

func TestPieceStylesLifecycle(t *testing.T) {
	s := newPieceServer(t)
	// ทุกคนอ่านได้ และเริ่มจากรายการว่าง
	status, body, _ := s.call(http.MethodGet, "/api/piece-styles", "", "", nil)
	if list, _ := body["styles"].([]any); status != http.StatusOK || len(list) != 0 {
		t.Fatalf("empty list: %d %v", status, body["_raw"])
	}

	status, body, _ = s.call(http.MethodPost, "/api/pieces/styles", artistToken, "application/json", []byte(`{"name":"  ชุด   น่ารัก "}`))
	st := styleAt(body, 0)
	id, _ := st["id"].(string)
	if status != http.StatusOK || id == "" || st["name"] != "ชุด น่ารัก" || st["rev"] != float64(1) {
		t.Fatalf("create: %d %v", status, body["_raw"])
	}
	base := "/api/pieces/styles/" + id

	// ใส่รูปให้หมากหนึ่งตัว แล้วเปลี่ยน: รูปเก่าถูกลบ
	status, body, _ = s.call(http.MethodPut, base+"/images/wK?rev=1", artistToken, "image/png", sizedPNG(t, 32, 32))
	images, _ := styleAt(body, 0)["images"].(map[string]any)
	first, _ := images["wK"].(string)
	if status != http.StatusOK || !strings.HasPrefix(first, "/api/content-images/") || s.store.ImageCount() != 1 {
		t.Fatalf("set image: %d %v", status, body["_raw"])
	}
	if status, _, header := s.call(http.MethodGet, first, "", "", nil); status != http.StatusOK || header.Get("Content-Type") != "image/png" {
		t.Fatalf("serve piece image: %d", status)
	}
	status, body, _ = s.call(http.MethodPut, base+"/images/wK?rev=2", artistToken, "image/png", sizedPNG(t, 16, 16))
	images, _ = styleAt(body, 0)["images"].(map[string]any)
	if status != http.StatusOK || images["wK"] == first || s.store.ImageCount() != 1 {
		t.Fatalf("replace image: %d images=%d", status, s.store.ImageCount())
	}
	// เลขรุ่นเก่า ชื่อหมากที่ไม่มี และไฟล์ที่ไม่ใช่รูป ถูกปฏิเสธ และไม่มีรูปค้างในที่เก็บ
	if status, body, _ := s.call(http.MethodPut, base+"/images/bK?rev=1", artistToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusConflict || body["error"] != "conflict" {
		t.Fatalf("stale rev: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodPut, base+"/images/wX?rev=3", artistToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusBadRequest {
		t.Fatalf("unknown piece: %d", status)
	}
	if status, body, _ := s.call(http.MethodPut, base+"/images/bK?rev=3", artistToken, "image/png", []byte("<svg onload=alert(1)/>")); status != http.StatusBadRequest || body["error"] != "bad_image" {
		t.Fatalf("svg: %d %v", status, body["_raw"])
	}
	if s.store.ImageCount() != 1 {
		t.Fatalf("rejected uploads left images behind: %d", s.store.ImageCount())
	}

	// เปลี่ยนชื่อ
	status, body, _ = s.call(http.MethodPut, base+"?rev=3", artistToken, "application/json", []byte(`{"name":"ชุดใหม่"}`))
	if status != http.StatusOK || styleAt(body, 0)["name"] != "ชุดใหม่" || styleAt(body, 0)["rev"] != float64(4) {
		t.Fatalf("rename: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodPut, base+"?rev=4", artistToken, "application/json", []byte(`{"name":""}`)); status != http.StatusBadRequest {
		t.Fatalf("empty name: %d", status)
	}
	// เอารูปออก แล้วใส่ใหม่ แล้วลบทั้งรูปแบบ: รูปทั้งหมดหายจากที่เก็บ
	if status, _, _ := s.call(http.MethodDelete, base+"/images/wK?rev=4", artistToken, "", nil); status != http.StatusOK || s.store.ImageCount() != 0 {
		t.Fatalf("remove image: %d images=%d", status, s.store.ImageCount())
	}
	s.call(http.MethodPut, base+"/images/wQ?rev=5", artistToken, "image/png", sizedPNG(t, 8, 8))
	s.call(http.MethodPut, base+"/images/bQ?rev=6", artistToken, "image/png", sizedPNG(t, 8, 8))
	if s.store.ImageCount() != 2 {
		t.Fatalf("two images expected: %d", s.store.ImageCount())
	}
	status, body, _ = s.call(http.MethodDelete, base+"?rev=7", artistToken, "", nil)
	if list, _ := body["styles"].([]any); status != http.StatusOK || len(list) != 0 || s.store.ImageCount() != 0 {
		t.Fatalf("delete style: %d images=%d %v", status, s.store.ImageCount(), body["_raw"])
	}
}

func TestPieceStyleLimit(t *testing.T) {
	s := newPieceServer(t)
	for i := 0; i < content.MaxPieceStyles; i++ {
		if _, err := s.store.UpdatePieceStyles(t.Context(), "t", func(p *content.PieceStyles) error { return p.Create("s") }); err != nil {
			t.Fatal(err)
		}
	}
	if status, body, _ := s.call(http.MethodPost, "/api/pieces/styles", artistToken, "application/json", []byte(`{"name":"one more"}`)); status != http.StatusConflict || body["error"] != "limit" {
		t.Fatalf("over the limit: %d %v", status, body["_raw"])
	}
}
