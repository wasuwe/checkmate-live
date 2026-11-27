package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/content"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/members"
)

// fakeMembers เป็นที่เก็บสมาชิกใน test: user ID ตรงกับที่ emailAuth ออกให้ ("user-<email>")
type fakeMembers struct {
	list []members.Member
	fail error
}

func (f *fakeMembers) List(context.Context) ([]members.Member, error) {
	return f.list, f.fail
}

func (f *fakeMembers) Get(_ context.Context, id string) (*members.Detail, error) {
	if f.fail != nil {
		return nil, f.fail
	}
	for _, m := range f.list {
		if m.ID == id {
			return &members.Detail{
				Member:    m,
				ByGame:    []members.GameStats{{Game: "chess", Stats: m.Stats}},
				Opponents: []members.Opponent{{Stats: members.Stats{Games: 1, Wins: 1}}},
				Recent:    []members.GameRow{{Game: "chess", Color: "w", Outcome: "win", Reason: "checkmate", TimeControl: "10+0", Seconds: 90}},
			}, nil
		}
	}
	return nil, members.ErrNotFound
}

const (
	nokToken = "mail:nok@example.com"
	taeToken = "mail:tae@example.com"
	nokID    = "user-nok@example.com"
	taeID    = "user-tae@example.com"
)

func newMembersServer(t *testing.T, store *fakeMembers) (*adminServer, *hub.Hub) {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	authn := auth.Multi{Guest: guest, User: emailAuth{}}
	// ไม่ใช้ห้องรอ: เกมเริ่มทันทีที่คนที่สองเข้าห้อง
	h := hub.New(hub.Config{CoinFlip: func() bool { return false }}, authn)
	cfg := Config{Hub: h, Auth: authn, Guest: guest, Content: content.NewMemory(), Admins: []string{"boss@example.com"}}
	if store != nil {
		cfg.Members = store
	}
	srv := httptest.NewServer(New(cfg))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &adminServer{testServer: &testServer{Server: srv, t: t}}, h
}

func users(body map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	list, _ := body["users"].([]any)
	for _, v := range list {
		if u, ok := v.(map[string]any); ok {
			id, _ := u["id"].(string)
			out[id] = u
		}
	}
	return out
}

func TestMembersAreForAdminsOnly(t *testing.T) {
	s, _ := newMembersServer(t, &fakeMembers{list: []members.Member{{ID: nokID, Email: "nok@example.com"}}})
	_, guestToken := s.newGuest()
	for _, path := range []string{"/api/admin/users", "/api/admin/users/" + nokID} {
		for name, tc := range map[string]struct {
			token string
			want  int
		}{
			"no token":      {"", http.StatusUnauthorized},
			"bad token":     {"nonsense", http.StatusUnauthorized},
			"guest":         {guestToken, http.StatusForbidden},
			"other account": {nokToken, http.StatusForbidden}, // สมาชิกดูข้อมูลของตัวเองผ่านทางนี้ก็ไม่ได้
			"admin":         {adminToken, http.StatusOK},
		} {
			status, body, header := s.call(http.MethodGet, path, tc.token, "", nil)
			if status != tc.want {
				t.Errorf("%s as %s = %d, want %d", path, name, status, tc.want)
			}
			if raw, _ := body["_raw"].(string); status != http.StatusOK && strings.Contains(raw, "nok@example.com") {
				t.Errorf("%s as %s leaked an email: %s", path, name, raw)
			}
			if header.Get("Cache-Control") != "no-store" {
				t.Errorf("%s as %s: Cache-Control = %q", path, name, header.Get("Cache-Control"))
			}
		}
	}
	// อ่านอย่างเดียว: ไม่มี method อื่น
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		if status, _, _ := s.call(method, "/api/admin/users/"+nokID, adminToken, "", nil); status == http.StatusOK {
			t.Errorf("%s on a member returned 200", method)
		}
	}
}

func TestMembersListWithLiveStatus(t *testing.T) {
	joined := time.Date(2026, 11, 20, 8, 0, 0, 0, time.UTC)
	played := joined.Add(time.Hour)
	store := &fakeMembers{list: []members.Member{
		{ID: nokID, Email: "nok@example.com", Name: "Nok", JoinedAt: joined, Stats: members.Stats{Games: 4, Wins: 2, Losses: 1, Draws: 1, Seconds: 3600, LastPlayed: &played}},
		{ID: taeID, Email: "tae@example.com", JoinedAt: joined},
		{ID: "user-idle@example.com", Email: "idle@example.com", JoinedAt: joined},
	}}
	s, _ := newMembersServer(t, store)

	// ยังไม่มีใครเล่น
	status, body, _ := s.call(http.MethodGet, "/api/admin/users", adminToken, "", nil)
	list := users(body)
	if status != http.StatusOK || len(list) != 3 {
		t.Fatalf("list = %d %v", status, body["_raw"])
	}
	nok := list[nokID]
	if nok["email"] != "nok@example.com" || nok["name"] != "Nok" || nok["games"] != float64(4) || nok["wins"] != float64(2) ||
		nok["losses"] != float64(1) || nok["draws"] != float64(1) || nok["seconds"] != float64(3600) || nok["lastPlayedAt"] == nil || nok["live"] != nil {
		t.Fatalf("nok before playing: %v", nok)
	}

	// nok สร้างห้องแล้วนั่งรอ
	room := s.newRoom(nokToken)
	nokConn := s.connect(nokToken)
	nokConn.send(map[string]any{"type": "join", "room": room})
	nokConn.until("waiting", func(m msg) bool { return m.Type == "state" && m.Status == "waiting" })
	_, body, _ = s.call(http.MethodGet, "/api/admin/users", adminToken, "", nil)
	live, _ := users(body)[nokID]["live"].(map[string]any)
	if live["status"] != "waiting" || live["room"] != room || live["game"] != "chess" || live["connected"] != true || live["opponent"] != nil {
		t.Fatalf("nok waiting: %v", live)
	}

	// tae เข้ามา: กำลังเล่นกัน
	taeConn := s.connect(taeToken)
	taeConn.send(map[string]any{"type": "join", "room": room})
	nokConn.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
	taeConn.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
	_, body, _ = s.call(http.MethodGet, "/api/admin/users", adminToken, "", nil)
	list = users(body)
	nokLive, _ := list[nokID]["live"].(map[string]any)
	taeLive, _ := list[taeID]["live"].(map[string]any)
	// คู่แข่งแสดงเป็นชื่อ ถ้าไม่ได้ตั้งชื่อใช้อีเมล
	if nokLive["status"] != "playing" || nokLive["opponent"] != "tae@example.com" || taeLive["status"] != "playing" || taeLive["opponent"] != "Nok" {
		t.Fatalf("playing: nok=%v tae=%v", nokLive, taeLive)
	}
	if list["user-idle@example.com"]["live"] != nil {
		t.Fatalf("a member who is not in a room has live status: %v", list["user-idle@example.com"])
	}

	// หน้ารายละเอียดมีสถานะเดียวกัน พร้อมสถิติแยก
	status, body, _ = s.call(http.MethodGet, "/api/admin/users/"+nokID, adminToken, "", nil)
	user, _ := body["user"].(map[string]any)
	detailLive, _ := user["live"].(map[string]any)
	if status != http.StatusOK || user["id"] != nokID || detailLive["status"] != "playing" || detailLive["opponent"] != "tae@example.com" {
		t.Fatalf("detail = %d %v", status, body["_raw"])
	}
	for _, key := range []string{"byGame", "opponents", "recent"} {
		if l, _ := user[key].([]any); len(l) != 1 {
			t.Errorf("detail.%s = %v", key, user[key])
		}
	}
}

func TestMembersLiveStatusAgainstAGuest(t *testing.T) {
	store := &fakeMembers{list: []members.Member{{ID: nokID, Email: "nok@example.com"}}}
	s, _ := newMembersServer(t, store)
	room := s.newRoom(nokToken)
	_, guestToken := s.newGuest()
	nokConn, guestConn := s.connect(nokToken), s.connect(guestToken)
	nokConn.send(map[string]any{"type": "join", "room": room})
	nokConn.until("waiting", func(m msg) bool { return m.Type == "state" && m.Status == "waiting" })
	guestConn.send(map[string]any{"type": "join", "room": room})
	nokConn.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })

	_, body, _ := s.call(http.MethodGet, "/api/admin/users", adminToken, "", nil)
	live, _ := users(body)[nokID]["live"].(map[string]any)
	if live["status"] != "playing" || live["opponentGuest"] != true || live["opponent"] != nil {
		t.Fatalf("against a guest: %v", live)
	}
	// ไม่มี user ID ของผู้เล่นรับเชิญในคำตอบ
	if raw, _ := body["_raw"].(string); strings.Contains(raw, "guest_") {
		t.Fatalf("the response carries a guest id: %s", raw)
	}
}

func TestMembersErrors(t *testing.T) {
	store := &fakeMembers{list: []members.Member{{ID: nokID, Email: "nok@example.com"}}}
	s, _ := newMembersServer(t, store)
	if status, body, _ := s.call(http.MethodGet, "/api/admin/users/user-nobody@example.com", adminToken, "", nil); status != http.StatusNotFound || body["error"] != "not_found" {
		t.Fatalf("unknown member = %d %v", status, body)
	}
	// ฐานข้อมูลล่ม: 503 และไม่ส่งรายละเอียดของ error ออกไป
	store.fail = errors.New("pq: connection refused at 10.0.0.5")
	for _, path := range []string{"/api/admin/users", "/api/admin/users/" + nokID} {
		status, body, _ := s.call(http.MethodGet, path, adminToken, "", nil)
		if raw, _ := body["_raw"].(string); status != http.StatusServiceUnavailable || strings.Contains(raw, "10.0.0.5") {
			t.Errorf("%s with a broken store = %d %s", path, status, raw)
		}
	}

	// ไม่มีฐานข้อมูล (Members เป็น nil): ไม่เปิด route
	bare, _ := newMembersServer(t, nil)
	if status, _, _ := bare.call(http.MethodGet, "/api/admin/users", adminToken, "", nil); status != http.StatusNotFound {
		t.Fatalf("without a member store = %d, want 404", status)
	}
}
