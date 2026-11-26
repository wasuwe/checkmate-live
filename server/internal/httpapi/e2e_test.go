package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

const e2eTimeout = 5 * time.Second

// msg คือข้อความจากเซิร์ฟเวอร์เท่าที่ test ต้องใช้
type msg struct {
	Type    string `json:"type"`
	ID      int    `json:"id"`
	Sender  string `json:"sender"`
	Code    string `json:"code"`
	UserID  string `json:"userId"`
	Status  string `json:"status"`
	Turn    string `json:"turn"`
	Ply     int    `json:"ply"`
	Result  string `json:"result"`
	Reason  string `json:"reason"`
	Players map[string]struct {
		Name   string `json:"name"`
		Avatar string `json:"avatar"`
		Guest  bool   `json:"guest"`
	} `json:"players"`
	You struct {
		Role  string `json:"role"`
		Color string `json:"color"`
	} `json:"you"`
}

type testServer struct {
	*httptest.Server
	t *testing.T
}

func newTestServer(t *testing.T, cfg hub.Config) *testServer {
	t.Helper()
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.CoinFlip == nil {
		cfg.CoinFlip = func() bool { return false } // คนเข้าก่อนเป็นขาว
	}
	h := hub.New(cfg, guest)
	srv := httptest.NewServer(New(Config{Hub: h, Auth: guest, Guest: guest}))
	t.Cleanup(func() {
		srv.Close()
		h.Close()
	})
	return &testServer{Server: srv, t: t}
}

func (s *testServer) postJSON(path, token string) (int, map[string]string) {
	s.t.Helper()
	req, err := http.NewRequest(http.MethodPost, s.URL+path, nil)
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
	body := map[string]string{}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body
}

func (s *testServer) newGuest() (userID, token string) {
	s.t.Helper()
	status, body := s.postJSON("/api/guest", "")
	if status != http.StatusCreated || body["token"] == "" || body["userId"] == "" {
		s.t.Fatalf("POST /api/guest = %d %v", status, body)
	}
	return body["userId"], body["token"]
}

func (s *testServer) newRoom(token string) string {
	s.t.Helper()
	status, body := s.postJSON("/api/rooms", token)
	if status != http.StatusCreated || body["roomId"] == "" {
		s.t.Fatalf("POST /api/rooms = %d %v", status, body)
	}
	return body["roomId"]
}

// wsClient คือ WebSocket ฝั่ง client ใน test
type wsClient struct {
	t    *testing.T
	conn *websocket.Conn
}

func (s *testServer) dial(header http.Header) (*wsClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), e2eTimeout)
	defer cancel()
	url := "ws" + strings.TrimPrefix(s.URL, "http") + "/ws"
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: header})
	if err != nil {
		return nil, err
	}
	s.t.Cleanup(func() { _ = conn.CloseNow() })
	return &wsClient{t: s.t, conn: conn}, nil
}

// connect เปิด WebSocket และ auth ให้เรียบร้อย
func (s *testServer) connect(token string) *wsClient {
	s.t.Helper()
	c, err := s.dial(nil)
	if err != nil {
		s.t.Fatalf("dial: %v", err)
	}
	c.send(map[string]any{"type": "auth", "token": token})
	c.until("auth_ok", func(m msg) bool { return m.Type == "auth_ok" })
	return c
}

func (c *wsClient) send(v any) {
	c.t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		c.t.Fatal(err)
	}
	c.sendRaw(string(b))
}

func (c *wsClient) sendRaw(s string) {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), e2eTimeout)
	defer cancel()
	if err := c.conn.Write(ctx, websocket.MessageText, []byte(s)); err != nil {
		c.t.Fatalf("write: %v", err)
	}
}

func (c *wsClient) read() (msg, error) {
	ctx, cancel := context.WithTimeout(context.Background(), e2eTimeout)
	defer cancel()
	_, data, err := c.conn.Read(ctx)
	if err != nil {
		return msg{}, err
	}
	var m msg
	if err := json.Unmarshal(data, &m); err != nil {
		c.t.Fatalf("bad server message %s: %v", data, err)
	}
	return m, nil
}

func (c *wsClient) until(what string, match func(msg) bool) msg {
	c.t.Helper()
	for {
		m, err := c.read()
		if err != nil {
			c.t.Fatalf("waiting for %s: %v", what, err)
		}
		if match(m) {
			return m
		}
	}
}

func (c *wsClient) expectError(code string) {
	c.t.Helper()
	c.until("error "+code, func(m msg) bool { return m.Type == "error" && m.Code == code })
}

func (c *wsClient) move(ply int, from, to string) {
	c.t.Helper()
	c.send(map[string]any{"type": "move", "ply": ply, "from": from, "to": to, "promo": ""})
}

// expectClosed ตรวจว่าเซิร์ฟเวอร์ตัดการเชื่อมต่อ
func (c *wsClient) expectClosed(what string) {
	c.t.Helper()
	for {
		if _, err := c.read(); err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				c.t.Fatalf("%s: connection was not closed", what)
			}
			return
		}
	}
}

// TestFullGameOverWebSocket คือเกณฑ์ของเฟส 1: สอง connection เล่นกันจนรุกจน
func TestFullGameOverWebSocket(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, whiteToken := s.newGuest()
	_, blackToken := s.newGuest()
	roomID := s.newRoom(whiteToken)

	white := s.connect(whiteToken)
	white.send(map[string]string{"type": "join", "room": roomID})
	white.until("waiting", func(m msg) bool { return m.Type == "state" && m.Status == "waiting" })

	black := s.connect(blackToken)
	black.send(map[string]string{"type": "join", "room": roomID})

	w := white.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
	b := black.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })
	if w.You.Color != "w" || b.You.Color != "b" {
		t.Fatalf("colors: white=%q black=%q", w.You.Color, b.You.Color)
	}

	// ตาเดินผิดกติกาและผิดตาต้องถูกปฏิเสธโดยไม่กระทบเกม
	black.move(0, "e7", "e5")
	black.expectError("not_your_turn")
	white.move(0, "e2", "e5")
	white.expectError("illegal_move")

	// fool's mate
	plies := []struct {
		by       *wsClient
		from, to string
	}{
		{white, "f2", "f3"},
		{black, "e7", "e5"},
		{white, "g2", "g4"},
		{black, "d8", "h4"},
	}
	final := map[*wsClient]msg{}
	for i, p := range plies {
		p.by.move(i, p.from, p.to)
		want := i + 1
		for _, c := range []*wsClient{white, black} {
			final[c] = c.until("ply", func(m msg) bool { return m.Type == "state" && m.Ply == want })
		}
	}

	// state ของตาสุดท้ายต้องบอกผลเกมมาด้วย
	for _, c := range []*wsClient{white, black} {
		if st := final[c]; st.Status != "finished" || st.Result != "0-1" || st.Reason != "checkmate" {
			t.Fatalf("final state = %+v, want finished 0-1 by checkmate", st)
		}
	}

	white.move(4, "a2", "a3")
	white.expectError("game_not_active")
}

// TestResignAndReconnectOverWebSocket คือเกณฑ์ของเฟส 3 ผ่าน connection จริง:
// หลุดแล้วกลับเข้าที่นั่งเดิมได้ และยอมแพ้แล้วอีกฝ่ายชนะ
func TestResignAndReconnectOverWebSocket(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, whiteToken := s.newGuest()
	_, blackToken := s.newGuest()
	roomID := s.newRoom(whiteToken)
	join := map[string]string{"type": "join", "room": roomID}
	isState := func(m msg) bool { return m.Type == "state" }

	white := s.connect(whiteToken)
	white.send(join)
	white.until("waiting", isState)
	black := s.connect(blackToken)
	black.send(join)
	black.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })

	white.move(0, "e2", "e4")
	black.until("ply 1", func(m msg) bool { return m.Type == "state" && m.Ply == 1 })

	// ดำหลุด แล้วเปิด connection ใหม่ด้วย token เดิม
	_ = black.conn.CloseNow()
	black2 := s.connect(blackToken)
	black2.send(join)
	st := black2.until("state after reconnect", isState)
	if st.You.Role != "player" || st.You.Color != "b" || st.Ply != 1 || st.Status != "playing" {
		t.Fatalf("state after reconnect = %+v, want black player at ply 1", st)
	}
	black2.move(1, "e7", "e5")
	white.until("ply 2", func(m msg) bool { return m.Type == "state" && m.Ply == 2 })

	// ข้อความ resign ที่พยายามระบุผู้ชนะเองต้องถูกปฏิเสธ
	black2.sendRaw(`{"type":"resign","winner":"b"}`)
	black2.expectError("bad_message")

	black2.send(map[string]string{"type": "resign"})
	for _, c := range []*wsClient{white, black2} {
		over := c.until("game_over", func(m msg) bool { return m.Type == "game_over" })
		if over.Result != "1-0" || over.Reason != "resign" {
			t.Fatalf("game_over = %+v, want 1-0 by resign", over)
		}
	}
}

func TestAbandonOverWebSocket(t *testing.T) {
	s := newTestServer(t, hub.Config{AbandonGrace: 100 * time.Millisecond})
	_, whiteToken := s.newGuest()
	_, blackToken := s.newGuest()
	roomID := s.newRoom(whiteToken)
	join := map[string]string{"type": "join", "room": roomID}

	white := s.connect(whiteToken)
	white.send(join)
	white.until("waiting", func(m msg) bool { return m.Type == "state" })
	black := s.connect(blackToken)
	black.send(join)
	white.until("playing", func(m msg) bool { return m.Type == "state" && m.Status == "playing" })

	_ = black.conn.CloseNow() // ปิดแท็บโดยไม่บอกลา
	over := white.until("game_over", func(m msg) bool { return m.Type == "game_over" })
	if over.Result != "1-0" || over.Reason != "abandon" {
		t.Fatalf("game_over = %+v, want 1-0 by abandon", over)
	}
}

func TestSpectatorCannotMove(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, t1 := s.newGuest()
	_, t2 := s.newGuest()
	_, t3 := s.newGuest()
	roomID := s.newRoom(t1)

	for _, tok := range []string{t1, t2} {
		c := s.connect(tok)
		c.send(map[string]string{"type": "join", "room": roomID})
		c.until("state", func(m msg) bool { return m.Type == "state" })
	}

	spectator := s.connect(t3)
	spectator.send(map[string]string{"type": "join", "room": roomID})
	st := spectator.until("state", func(m msg) bool { return m.Type == "state" })
	if st.You.Role != "spectator" {
		t.Fatalf("role = %q, want spectator", st.You.Role)
	}
	spectator.move(0, "e2", "e4")
	spectator.expectError("not_a_player")
}

func TestWebSocketRejectsBadToken(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	c, err := s.dial(nil)
	if err != nil {
		t.Fatal(err)
	}
	c.send(map[string]string{"type": "auth", "token": "guest_abc.forged"})
	c.expectError("unauthorized")
	c.expectClosed("bad token")
}

func TestWebSocketRequiresAuthFirst(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	c, err := s.dial(nil)
	if err != nil {
		t.Fatal(err)
	}
	c.send(map[string]string{"type": "join", "room": "abcdefghjkmn"})
	c.expectClosed("join before auth")
}

func TestWebSocketAuthTimeout(t *testing.T) {
	s := newTestServer(t, hub.Config{AuthTimeout: 50 * time.Millisecond})
	c, err := s.dial(nil)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	c.expectClosed("silent client")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("server took %v to drop a silent connection", elapsed)
	}
}

func TestWebSocketRejectsForeignOrigin(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	if _, err := s.dial(http.Header{"Origin": {"https://evil.example"}}); err == nil {
		t.Fatal("cross-origin WebSocket was accepted")
	}
}

func TestWebSocketAllowsConfiguredOrigin(t *testing.T) {
	s := newTestServer(t, hub.Config{OriginPatterns: []string{"https://chess.example.com"}})
	if _, err := s.dial(http.Header{"Origin": {"https://chess.example.com"}}); err != nil {
		t.Fatalf("configured origin was rejected: %v", err)
	}
	if _, err := s.dial(http.Header{"Origin": {"http://chess.example.com"}}); err == nil {
		t.Fatal("origin with the wrong scheme was accepted")
	}
}

func TestWebSocketProtocolErrors(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, token := s.newGuest()
	c := s.connect(token)

	c.move(0, "e2", "e4")
	c.expectError("not_joined")

	c.send(map[string]string{"type": "join", "room": "abcdefghjkmn"})
	c.expectError("room_not_found")

	c.sendRaw(`{"type":"move","ply":0,"from":"e2","to":"e4","winner":"w"}`)
	c.expectError("bad_message")

	c.sendRaw(`not json`)
	c.expectError("bad_message")

	roomID := s.newRoom(token)
	c.send(map[string]string{"type": "join", "room": roomID})
	c.until("state", func(m msg) bool { return m.Type == "state" })
	c.send(map[string]string{"type": "join", "room": roomID})
	c.expectError("already_joined")
}

func TestWebSocketOversizedMessageDisconnects(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, token := s.newGuest()
	c := s.connect(token)

	c.sendRaw(`{"type":"auth","token":"` + strings.Repeat("a", 8192) + `"}`)
	c.expectClosed("oversized message")
}

// createRoomWith ส่ง body ดิบไปที่ POST /api/rooms คืน status และรหัสห้อง
func (s *testServer) createRoomWith(token, body string) (int, string) {
	s.t.Helper()
	req, err := http.NewRequest(http.MethodPost, s.URL+"/api/rooms", strings.NewReader(body))
	if err != nil {
		s.t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.Client().Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	out := map[string]string{}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out["roomId"]
}

func TestCreateRoomTimeControl(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, token := s.newGuest()

	type clockState struct {
		Type  string `json:"type"`
		TC    string `json:"tc"`
		Clock struct {
			W int64 `json:"w"`
		} `json:"clock"`
	}
	valid := map[string]struct {
		tc string
		ms int64
	}{
		``:                        {"10+0", 600_000},
		`{}`:                      {"10+0", 600_000},
		`{"timeControl":"5+3"}`:   {"5+3", 300_000},
		`{"timeControl":"15+10"}`: {"15+10", 900_000},
	}
	for body, want := range valid {
		status, roomID := s.createRoomWith(token, body)
		if status != http.StatusCreated {
			t.Fatalf("body %q: status = %d, want 201", body, status)
		}
		c := s.connect(token)
		c.send(map[string]string{"type": "join", "room": roomID})
		ctx, cancel := context.WithTimeout(context.Background(), e2eTimeout)
		_, data, err := c.conn.Read(ctx)
		cancel()
		if err != nil {
			t.Fatal(err)
		}
		var st clockState
		if err := json.Unmarshal(data, &st); err != nil || st.Type != "state" {
			t.Fatalf("body %q: first message %s", body, data)
		}
		if st.TC != want.tc || st.Clock.W != want.ms {
			t.Errorf("body %q: tc=%q white=%dms, want %q %dms", body, st.TC, st.Clock.W, want.tc, want.ms)
		}
	}

	invalid := []string{
		`{"timeControl":"0+0"}`,
		`{"timeControl":"999+0"}`,
		`{"timeControl":"fast"}`,
		`{"timeControl":5}`,
		`{"timeControl":"5+3","winner":"w"}`,
		`not json`,
		`{"timeControl":"` + strings.Repeat("1", 1000) + `"}`,
	}
	for _, body := range invalid {
		if status, _ := s.createRoomWith(token, body); status != http.StatusBadRequest {
			t.Errorf("body %.40q: status = %d, want 400", body, status)
		}
	}
}

func TestChatOverWebSocket(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	_, t1 := s.newGuest()
	_, t2 := s.newGuest()
	roomID := s.newRoom(t1)
	join := map[string]string{"type": "join", "room": roomID}
	isState := func(m msg) bool { return m.Type == "state" }

	a := s.connect(t1)
	a.send(map[string]string{"type": "chat", "text": "hi"})
	a.expectError("not_joined")
	a.send(join)
	a.until("state", isState)
	b := s.connect(t2)
	b.send(join)
	b.until("state", isState)

	a.send(map[string]string{"type": "chat", "text": "<img src=x onerror=alert(1)>"})
	b.until("chat", func(m msg) bool { return m.Type == "chat" })

	a.sendRaw(`{"type":"chat","text":"` + strings.Repeat("ก", 201) + `"}`)
	a.expectError("bad_message")
	a.sendRaw(`{"type":"chat","text":"hi","from":"b"}`)
	a.expectError("bad_message")

	// คนที่เข้าทีหลังได้ประวัติแชท
	_, t3 := s.newGuest()
	c := s.connect(t3)
	c.send(join)
	c.until("chat_history", func(m msg) bool { return m.Type == "chat_history" })
}

func TestCreateRoomRequiresAuth(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	for name, token := range map[string]string{"no token": "", "forged token": "guest_abc.forged"} {
		if status, _ := s.postJSON("/api/rooms", token); status != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", name, status)
		}
	}
}

func TestUnknownAPIPathIs404(t *testing.T) {
	s := newTestServer(t, hub.Config{})
	resp, err := s.Client().Get(s.URL + "/api/nope")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}
