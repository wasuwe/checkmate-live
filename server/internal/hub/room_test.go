package hub

import (
	"encoding/json"
	"testing"
	"testing/synctest"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// serverMsg รวม field ของข้อความขาออกทุกชนิด ใช้ถอดข้อความใน test
type serverMsg struct {
	Type     string                     `json:"type"`
	Code     string                     `json:"code"`
	UserID   string                     `json:"userId"`
	Room     string                     `json:"room"`
	Status   Status                     `json:"status"`
	FEN      string                     `json:"fen"`
	Turn     game.Color                 `json:"turn"`
	Ply      int                        `json:"ply"`
	LastMove *moveInfo                  `json:"lastMove"`
	Players  map[game.Color]*playerInfo `json:"players"`
	You      youInfo                    `json:"you"`
	Result   string                     `json:"result"`
	Reason   string                     `json:"reason"`
}

const testTimeout = 3 * time.Second

// newTestHub สร้าง Hub ที่คนเข้าก่อนได้สีขาวเสมอ
func newTestHub(t *testing.T, cfg Config) *Hub {
	t.Helper()
	if cfg.CoinFlip == nil {
		cfg.CoinFlip = func() bool { return false }
	}
	guest, err := auth.NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	h := New(cfg, guest)
	t.Cleanup(h.Close)
	return h
}

func newTestRoom(t *testing.T, h *Hub) *Room {
	t.Helper()
	id, err := h.CreateRoom()
	if err != nil {
		t.Fatal(err)
	}
	return h.room(id)
}

// fakeClient คือ Client ที่ไม่มี WebSocket จริง test อ่านข้อความขาออกจาก channel ได้ตรง ๆ
type fakeClient struct {
	*Client
	t      *testing.T
	kicked chan struct{}
}

func newFakeClient(t *testing.T, userID string) *fakeClient {
	t.Helper()
	f := &fakeClient{t: t, kicked: make(chan struct{})}
	f.Client = newClient(userID, func() { close(f.kicked) })
	return f
}

func (f *fakeClient) join(r *Room) {
	f.t.Helper()
	if !r.post(event{kind: evJoin, client: f.Client}) {
		f.t.Fatal("room is closed")
	}
}

func (f *fakeClient) leave(r *Room) {
	r.post(event{kind: evLeave, client: f.Client})
}

func (f *fakeClient) move(r *Room, ply int, uci string) {
	m := game.Move{From: uci[0:2], To: uci[2:4]}
	if len(uci) == 5 {
		m.Promo = uci[4:5]
	}
	r.post(event{kind: evMove, client: f.Client, ply: ply, move: m})
}

// next อ่านข้อความถัดไป
func (f *fakeClient) next() serverMsg {
	f.t.Helper()
	return f.until("a message", func(serverMsg) bool { return true })
}

// until อ่านข้อความไปเรื่อย ๆ จนเจอข้อความที่ตรงเงื่อนไข
func (f *fakeClient) until(what string, match func(serverMsg) bool) serverMsg {
	f.t.Helper()
	deadline := time.After(testTimeout)
	for {
		select {
		case b := <-f.send:
			var m serverMsg
			if err := json.Unmarshal(b, &m); err != nil {
				f.t.Fatalf("bad server message %s: %v", b, err)
			}
			if match(m) {
				return m
			}
		case <-deadline:
			f.t.Fatalf("%s: timed out waiting for %s", f.UserID, what)
			return serverMsg{}
		}
	}
}

func (f *fakeClient) untilState(what string, match func(serverMsg) bool) serverMsg {
	f.t.Helper()
	return f.until(what, func(m serverMsg) bool { return m.Type == "state" && match(m) })
}

func (f *fakeClient) expectError(code string) {
	f.t.Helper()
	f.until("error "+code, func(m serverMsg) bool { return m.Type == "error" && m.Code == code })
}

func isStatus(s Status) func(serverMsg) bool {
	return func(m serverMsg) bool { return m.Status == s }
}

func atPly(n int) func(serverMsg) bool {
	return func(m serverMsg) bool { return m.Ply == n }
}

// startGame เปิดห้องที่มีผู้เล่นครบสองคน alice เป็นขาว bob เป็นดำ
func startGame(t *testing.T, h *Hub) (r *Room, alice, bob *fakeClient) {
	t.Helper()
	r = newTestRoom(t, h)
	alice = newFakeClient(t, "alice")
	bob = newFakeClient(t, "bob")
	alice.join(r)
	alice.untilState("waiting", isStatus(StatusWaiting))
	bob.join(r)
	alice.untilState("playing", isStatus(StatusPlaying))
	bob.untilState("playing", isStatus(StatusPlaying))
	return r, alice, bob
}

func TestFirstPlayerWaits(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)

	st := alice.next()
	if st.Type != "state" || st.Status != StatusWaiting || st.Room != r.id {
		t.Fatalf("unexpected first message: %+v", st)
	}
	if st.You.Role != rolePlayer || st.You.Color != "" {
		t.Fatalf("you = %+v, want player without color", st.You)
	}
	if st.Players != nil {
		t.Fatalf("players should be hidden while waiting: %+v", st.Players)
	}
}

func TestSecondPlayerStartsGame(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)

	a := alice.untilState("playing", isStatus(StatusPlaying))
	b := bob.untilState("playing", isStatus(StatusPlaying))
	if a.You != (youInfo{Role: rolePlayer, Color: game.White}) {
		t.Fatalf("alice you = %+v, want white player", a.You)
	}
	if b.You != (youInfo{Role: rolePlayer, Color: game.Black}) {
		t.Fatalf("bob you = %+v, want black player", b.You)
	}
	if a.Turn != game.White || a.Ply != 0 {
		t.Fatalf("turn=%s ply=%d, want w/0", a.Turn, a.Ply)
	}
	if !a.Players[game.White].Connected || !a.Players[game.Black].Connected {
		t.Fatalf("both players should be connected: %+v", a.Players)
	}
}

func TestCoinFlipSwapsColors(t *testing.T) {
	h := newTestHub(t, Config{CoinFlip: func() bool { return true }})
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)

	a := alice.untilState("playing", isStatus(StatusPlaying))
	if a.You.Color != game.Black {
		t.Fatalf("alice color = %q, want black after swap", a.You.Color)
	}
}

func TestSameUserTwiceDoesNotStartGame(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	tab1, tab2 := newFakeClient(t, "alice"), newFakeClient(t, "alice")
	tab1.join(r)
	tab2.join(r)

	st := tab2.next()
	if st.Status != StatusWaiting || st.You.Role != rolePlayer {
		t.Fatalf("second tab of the same user: %+v", st)
	}
}

func TestThirdUserIsSpectator(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, _ := startGame(t, h)
	carol := newFakeClient(t, "carol")
	carol.join(r)

	st := carol.next()
	if st.You.Role != roleSpectator || st.You.Color != "" || st.Status != StatusPlaying {
		t.Fatalf("spectator state: %+v", st)
	}

	carol.move(r, 0, "e2e4")
	carol.expectError(errCodeNotAPlayer)

	// ตาเดินของคนดูต้องไม่เปลี่ยนเกม: ขาวยังเดินตาแรกได้ตามปกติ
	alice.move(r, 0, "e2e4")
	alice.untilState("ply 1", atPly(1))
}

func TestMoveBroadcastsToEveryone(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	carol := newFakeClient(t, "carol")
	carol.join(r)

	alice.move(r, 0, "e2e4")
	for _, c := range []*fakeClient{alice, bob, carol} {
		st := c.untilState("ply 1", atPly(1))
		if st.Turn != game.Black || st.LastMove == nil || *st.LastMove != (moveInfo{From: "e2", To: "e4"}) {
			t.Fatalf("%s got %+v", c.UserID, st)
		}
	}
}

func TestMoveRejections(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)

	bob.move(r, 0, "e7e5")
	bob.expectError(errCodeNotYourTurn)

	alice.move(r, 5, "e2e4")
	alice.expectError(errCodeStaleMove)

	alice.move(r, 0, "e2e5")
	alice.expectError(errCodeIllegalMove)

	// หลังถูกปฏิเสธทั้งหมด เกมต้องยังอยู่ที่ตาแรก
	alice.move(r, 0, "e2e4")
	st := alice.untilState("ply 1", atPly(1))
	if st.Turn != game.Black {
		t.Fatalf("turn = %s, want b", st.Turn)
	}

	// ส่งตาเดินซ้ำด้วย ply เก่า ต้องไม่ถูกนับ
	alice.move(r, 0, "d2d4")
	alice.expectError(errCodeNotYourTurn)
}

func TestReplayedMoveIsStale(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)

	alice.move(r, 0, "g1f3")
	bob.move(r, 1, "g8f6")
	alice.untilState("ply 2", atPly(2))

	// ถึงตาขาวอีกครั้ง แต่ข้อความนี้เป็นของ ply 0 ที่ถูกส่งซ้ำ
	alice.move(r, 0, "f3g1")
	alice.expectError(errCodeStaleMove)
}

func TestMoveBeforeGameStarts(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)
	alice.next()

	alice.move(r, 0, "e2e4")
	alice.expectError(errCodeGameNotActive)
}

func TestCheckmateEndsGame(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)

	alice.move(r, 0, "f2f3")
	bob.move(r, 1, "e7e5")
	alice.move(r, 2, "g2g4")
	bob.move(r, 3, "d8h4")

	for _, c := range []*fakeClient{alice, bob} {
		over := c.until("game_over", func(m serverMsg) bool { return m.Type == "game_over" })
		if over.Result != "0-1" || over.Reason != game.ReasonCheckmate {
			t.Fatalf("%s game_over = %+v", c.UserID, over)
		}
		st := c.untilState("finished", isStatus(StatusFinished))
		if st.Result != "0-1" || st.Reason != game.ReasonCheckmate || st.Ply != 4 {
			t.Fatalf("%s final state = %+v", c.UserID, st)
		}
	}

	alice.move(r, 4, "a2a3")
	alice.expectError(errCodeGameNotActive)
}

func TestReconnectKeepsSeat(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	alice.move(r, 0, "e2e4")
	bob.untilState("ply 1", atPly(1))

	bob.leave(r)
	alice.untilState("bob offline", func(m serverMsg) bool { return !m.Players[game.Black].Connected })

	bob2 := newFakeClient(t, "bob")
	bob2.join(r)
	st := bob2.next()
	if st.You != (youInfo{Role: rolePlayer, Color: game.Black}) || st.Ply != 1 || st.Status != StatusPlaying {
		t.Fatalf("state after reconnect = %+v", st)
	}
	alice.untilState("bob online", func(m serverMsg) bool { return m.Players[game.Black].Connected })

	bob2.move(r, 1, "e7e5")
	alice.untilState("ply 2", atPly(2))
}

func TestSlowClientIsKicked(t *testing.T) {
	h := newTestHub(t, Config{})
	r, _, bob := startGame(t, h)

	// bob ไม่อ่านข้อความเลย ส่วนแท็บอื่นเข้าออกจนเกิด broadcast เกิน buffer ของ bob
	for range sendBuffer {
		tab := newFakeClient(t, "carol")
		tab.join(r)
		tab.leave(r)
	}

	select {
	case <-bob.kicked:
	case <-time.After(testTimeout):
		t.Fatal("slow client was not kicked")
	}
}

func TestIdleRoomIsRemoved(t *testing.T) {
	h := newTestHub(t, Config{IdleTTL: 30 * time.Millisecond})
	r := newTestRoom(t, h)

	select {
	case <-r.done:
	case <-time.After(testTimeout):
		t.Fatal("idle room was not closed")
	}
	waitFor(t, "room removed from hub", func() bool { return h.RoomCount() == 0 })

	late := newFakeClient(t, "alice")
	if r.post(event{kind: evJoin, client: late.Client}) {
		t.Fatal("post to a closed room should fail")
	}
}

func TestOccupiedRoomIsKept(t *testing.T) {
	h := newTestHub(t, Config{IdleTTL: 30 * time.Millisecond})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)
	alice.next()

	select {
	case <-r.done:
		t.Fatal("room with a connected client was closed")
	case <-time.After(150 * time.Millisecond):
	}

	alice.leave(r)
	select {
	case <-r.done:
	case <-time.After(testTimeout):
		t.Fatal("room was not closed after the last client left")
	}
}

func TestHubCloseStopsRooms(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, _ := startGame(t, h)
	h.Close()

	select {
	case <-r.done:
	default:
		t.Fatal("room still running after hub close")
	}
	select {
	case <-alice.kicked:
	default:
		t.Fatal("client was not kicked on hub close")
	}
	if _, err := h.CreateRoom(); err != ErrClosed {
		t.Fatalf("CreateRoom after close: err = %v, want ErrClosed", err)
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(testTimeout)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// ---------- เฟส 3: ยอมแพ้ และหลุดจากเกม ----------

func (f *fakeClient) resign(r *Room) {
	r.post(event{kind: evResign, client: f.Client})
}

// drain อ่านข้อความที่ค้างอยู่ทั้งหมดโดยไม่รอ
func (f *fakeClient) drain() []serverMsg {
	f.t.Helper()
	var out []serverMsg
	for {
		select {
		case b := <-f.send:
			var m serverMsg
			if err := json.Unmarshal(b, &m); err != nil {
				f.t.Fatalf("bad server message %s: %v", b, err)
			}
			out = append(out, m)
		default:
			return out
		}
	}
}

func isGameOver(m serverMsg) bool { return m.Type == "game_over" }

func TestResign(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	alice.move(r, 0, "e2e4")
	bob.untilState("ply 1", atPly(1))

	bob.resign(r)
	for _, c := range []*fakeClient{alice, bob} {
		over := c.until("game_over", isGameOver)
		if over.Result != "1-0" || over.Reason != game.ReasonResign {
			t.Fatalf("%s game_over = %+v, want 1-0 by resign", c.UserID, over)
		}
		st := c.untilState("finished", isStatus(StatusFinished))
		if st.Result != "1-0" || st.Reason != game.ReasonResign {
			t.Fatalf("%s final state = %+v", c.UserID, st)
		}
	}
}

func TestResignWhenNotOnTurn(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)

	bob.resign(r) // ตาของขาว แต่ดำยอมแพ้ได้
	over := alice.until("game_over", isGameOver)
	if over.Result != "1-0" || over.Reason != game.ReasonResign {
		t.Fatalf("game_over = %+v, want 1-0 by resign", over)
	}
}

func TestResignIgnoredCases(t *testing.T) {
	h := newTestHub(t, Config{})

	t.Run("before the game starts", func(t *testing.T) {
		r := newTestRoom(t, h)
		alice := newFakeClient(t, "alice")
		alice.join(r)
		alice.next()
		alice.resign(r)

		bob := newFakeClient(t, "bob")
		bob.join(r)
		st := bob.untilState("playing", isStatus(StatusPlaying))
		if st.Result != "" {
			t.Fatalf("game should start normally, got %+v", st)
		}
	})

	t.Run("spectator", func(t *testing.T) {
		r, alice, _ := startGame(t, h)
		carol := newFakeClient(t, "carol")
		carol.join(r)
		carol.resign(r)

		alice.move(r, 0, "e2e4")
		st := alice.untilState("ply 1", atPly(1))
		if st.Status != StatusPlaying {
			t.Fatalf("spectator resign ended the game: %+v", st)
		}
	})

	t.Run("twice", func(t *testing.T) {
		r, alice, bob := startGame(t, h)
		alice.resign(r)
		bob.until("game_over", isGameOver)
		alice.until("game_over", isGameOver)

		alice.resign(r)
		bob.resign(r) // ผลต้องไม่พลิกกลับ
		alice.move(r, 0, "e2e4")
		alice.expectError(errCodeGameNotActive)
		for _, m := range append(alice.drain(), bob.drain()...) {
			if m.Type == "game_over" || (m.Type == "state" && m.Result != "0-1") {
				t.Fatalf("result changed after repeated resign: %+v", m)
			}
		}
	})
}

func TestAbandonAfterGrace(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: 60 * time.Millisecond})
	r, alice, bob := startGame(t, h)

	bob.leave(r)
	st := alice.untilState("bob offline", func(m serverMsg) bool { return !m.Players[game.Black].Connected })
	if st.Players[game.Black].GraceLeft < 1 {
		t.Fatalf("graceLeft = %d, want at least 1", st.Players[game.Black].GraceLeft)
	}
	if st.Players[game.White].GraceLeft != 0 {
		t.Fatalf("connected player has graceLeft %d", st.Players[game.White].GraceLeft)
	}

	over := alice.until("game_over", isGameOver)
	if over.Result != "1-0" || over.Reason != game.ReasonAbandon {
		t.Fatalf("game_over = %+v, want 1-0 by abandon", over)
	}
	final := alice.untilState("finished", isStatus(StatusFinished))
	if final.Players[game.Black].GraceLeft != 0 {
		t.Fatalf("graceLeft still set after the game ended: %+v", final.Players[game.Black])
	}
}

func TestReconnectWithinGraceCancelsAbandon(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: 150 * time.Millisecond})
	r, alice, bob := startGame(t, h)

	bob.leave(r)
	alice.untilState("bob offline", func(m serverMsg) bool { return !m.Players[game.Black].Connected })

	bob2 := newFakeClient(t, "bob")
	bob2.join(r)
	back := alice.untilState("bob online", func(m serverMsg) bool { return m.Players[game.Black].Connected })
	if back.Players[game.Black].GraceLeft != 0 {
		t.Fatalf("graceLeft = %d after reconnect", back.Players[game.Black].GraceLeft)
	}

	time.Sleep(300 * time.Millisecond) // เลยเวลาผ่อนผันเดิมไปแล้ว
	for _, m := range alice.drain() {
		if m.Type == "game_over" || m.Status == StatusFinished {
			t.Fatalf("game ended although the player came back: %+v", m)
		}
	}
	alice.move(r, 0, "e2e4")
	bob2.untilState("ply 1", atPly(1))
}

func TestSecondTabKeepsPlayerConnected(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: 50 * time.Millisecond})
	r, alice, bob := startGame(t, h)
	bobTab2 := newFakeClient(t, "bob")
	bobTab2.join(r)
	bobTab2.next()

	bob.leave(r)
	time.Sleep(200 * time.Millisecond)
	for _, m := range alice.drain() {
		if m.Type == "game_over" || (m.Type == "state" && !m.Players[game.Black].Connected) {
			t.Fatalf("player with an open tab was treated as gone: %+v", m)
		}
	}
}

func TestBothLeaveFirstLeaverLoses(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: 80 * time.Millisecond, IdleTTL: time.Minute})
	r, alice, bob := startGame(t, h)
	carol := newFakeClient(t, "carol") // คนดูอยู่เป็นพยาน
	carol.join(r)

	bob.leave(r)
	time.Sleep(20 * time.Millisecond)
	alice.leave(r)

	over := carol.until("game_over", isGameOver)
	if over.Result != "1-0" || over.Reason != game.ReasonAbandon {
		t.Fatalf("game_over = %+v, want black (first to leave) to lose by abandon", over)
	}
}

func TestLeaveWhileWaitingDoesNotForfeit(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: 30 * time.Millisecond})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)
	alice.next()
	alice.leave(r)
	time.Sleep(100 * time.Millisecond)

	alice2 := newFakeClient(t, "alice")
	alice2.join(r)
	st := alice2.next()
	if st.Status != StatusWaiting || st.You.Role != rolePlayer {
		t.Fatalf("state after returning to a waiting room = %+v", st)
	}
}

// TestAbandonDefaultIsSixtySeconds ใช้นาฬิกาจำลองตรวจค่าเริ่มต้นจริง: 59 วินาทียังไม่แพ้ ครบ 60 แพ้
func TestAbandonDefaultIsSixtySeconds(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := newTestHub(t, Config{})
		r := newTestRoom(t, h)
		alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
		alice.join(r)
		bob.join(r)
		synctest.Wait()
		alice.drain()

		bob.leave(r)
		synctest.Wait()
		msgs := alice.drain()
		if len(msgs) == 0 || msgs[len(msgs)-1].Players[game.Black].GraceLeft != 60 {
			t.Fatalf("expected graceLeft 60 right after disconnect, got %+v", msgs)
		}

		time.Sleep(59 * time.Second)
		synctest.Wait()
		if msgs := alice.drain(); len(msgs) != 0 {
			t.Fatalf("game changed before the grace period ended: %+v", msgs)
		}

		time.Sleep(time.Second)
		synctest.Wait()
		msgs = alice.drain()
		if len(msgs) != 2 || msgs[0].Type != "game_over" || msgs[0].Reason != game.ReasonAbandon || msgs[0].Result != "1-0" {
			t.Fatalf("after 60s want game_over 1-0 by abandon, got %+v", msgs)
		}
	})
}
