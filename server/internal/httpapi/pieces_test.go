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
		Admins: []string{"boss@example.com"},
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

func TestPieceStylesNeedAdmin(t *testing.T) {
	s := newPieceServer(t)
	// admin เพิ่มรูปแบบได้ (สิทธิ์เดียวกับหน้าจัดการข้อมูล) คนอื่นและคนที่ไม่ login ไม่ได้
	for token, want := range map[string]int{adminToken: http.StatusOK, otherToken: http.StatusForbidden, "": http.StatusUnauthorized} {
		if status, _, _ := s.call(http.MethodPost, "/api/pieces/styles", token, "application/json", []byte(`{"name":"x"}`)); status != want {
			t.Fatalf("create as %q: %d, want %d", token, status, want)
		}
	}
	for token, want := range map[string]int{otherToken: http.StatusForbidden, "": http.StatusUnauthorized} {
		if status, _, _ := s.call(http.MethodPut, "/api/pieces/styles/s1/images/wK?rev=1", token, "image/png", sizedPNG(t, 8, 8)); status != want {
			t.Fatalf("upload as %q: %d, want %d", token, status, want)
		}
	}
	if s.store.ImageCount() != 0 {
		t.Fatalf("a refused upload was stored")
	}
}

func TestPieceStylesLifecycle(t *testing.T) {
	s := newPieceServer(t)
	// ทุกคนอ่านได้ และเริ่มจากรายการว่าง
	status, body, _ := s.call(http.MethodGet, "/api/piece-styles", "", "", nil)
	if list, _ := body["styles"].([]any); status != http.StatusOK || len(list) != 0 {
		t.Fatalf("empty list: %d %v", status, body["_raw"])
	}

	status, body, _ = s.call(http.MethodPost, "/api/pieces/styles", adminToken, "application/json", []byte(`{"name":"  ชุด   น่ารัก "}`))
	st := styleAt(body, 0)
	id, _ := st["id"].(string)
	if status != http.StatusOK || id == "" || st["name"] != "ชุด น่ารัก" || st["rev"] != float64(1) {
		t.Fatalf("create: %d %v", status, body["_raw"])
	}
	base := "/api/pieces/styles/" + id

	// ใส่รูปให้หมากหนึ่งตัว แล้วเปลี่ยน: รูปเก่าถูกลบ
	status, body, _ = s.call(http.MethodPut, base+"/images/wK?rev=1", adminToken, "image/png", sizedPNG(t, 32, 32))
	images, _ := styleAt(body, 0)["images"].(map[string]any)
	first, _ := images["wK"].(string)
	if status != http.StatusOK || !strings.HasPrefix(first, "/api/content-images/") || s.store.ImageCount() != 1 {
		t.Fatalf("set image: %d %v", status, body["_raw"])
	}
	if status, _, header := s.call(http.MethodGet, first, "", "", nil); status != http.StatusOK || header.Get("Content-Type") != "image/png" {
		t.Fatalf("serve piece image: %d", status)
	}
	status, body, _ = s.call(http.MethodPut, base+"/images/wK?rev=2", adminToken, "image/png", sizedPNG(t, 16, 16))
	images, _ = styleAt(body, 0)["images"].(map[string]any)
	if status != http.StatusOK || images["wK"] == first || s.store.ImageCount() != 1 {
		t.Fatalf("replace image: %d images=%d", status, s.store.ImageCount())
	}
	// เลขรุ่นเก่า ชื่อหมากที่ไม่มี และไฟล์ที่ไม่ใช่รูป ถูกปฏิเสธ และไม่มีรูปค้างในที่เก็บ
	if status, body, _ := s.call(http.MethodPut, base+"/images/bK?rev=1", adminToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusConflict || body["error"] != "conflict" {
		t.Fatalf("stale rev: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodPut, base+"/images/wX?rev=3", adminToken, "image/png", sizedPNG(t, 8, 8)); status != http.StatusBadRequest {
		t.Fatalf("unknown piece: %d", status)
	}
	if status, body, _ := s.call(http.MethodPut, base+"/images/bK?rev=3", adminToken, "image/png", []byte("<svg onload=alert(1)/>")); status != http.StatusBadRequest || body["error"] != "bad_image" {
		t.Fatalf("svg: %d %v", status, body["_raw"])
	}
	if s.store.ImageCount() != 1 {
		t.Fatalf("rejected uploads left images behind: %d", s.store.ImageCount())
	}

	// เปลี่ยนชื่อ
	status, body, _ = s.call(http.MethodPut, base+"?rev=3", adminToken, "application/json", []byte(`{"name":"ชุดใหม่"}`))
	if status != http.StatusOK || styleAt(body, 0)["name"] != "ชุดใหม่" || styleAt(body, 0)["rev"] != float64(4) {
		t.Fatalf("rename: %d %v", status, body["_raw"])
	}
	if status, _, _ := s.call(http.MethodPut, base+"?rev=4", adminToken, "application/json", []byte(`{"name":""}`)); status != http.StatusBadRequest {
		t.Fatalf("empty name: %d", status)
	}
	// เอารูปออก แล้วใส่ใหม่ แล้วลบทั้งรูปแบบ: รูปทั้งหมดหายจากที่เก็บ
	if status, _, _ := s.call(http.MethodDelete, base+"/images/wK?rev=4", adminToken, "", nil); status != http.StatusOK || s.store.ImageCount() != 0 {
		t.Fatalf("remove image: %d images=%d", status, s.store.ImageCount())
	}
	s.call(http.MethodPut, base+"/images/wQ?rev=5", adminToken, "image/png", sizedPNG(t, 8, 8))
	s.call(http.MethodPut, base+"/images/bQ?rev=6", adminToken, "image/png", sizedPNG(t, 8, 8))
	if s.store.ImageCount() != 2 {
		t.Fatalf("two images expected: %d", s.store.ImageCount())
	}
	status, body, _ = s.call(http.MethodDelete, base+"?rev=7", adminToken, "", nil)
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
	if status, body, _ := s.call(http.MethodPost, "/api/pieces/styles", adminToken, "application/json", []byte(`{"name":"one more"}`)); status != http.StatusConflict || body["error"] != "limit" {
		t.Fatalf("over the limit: %d %v", status, body["_raw"])
	}
}
