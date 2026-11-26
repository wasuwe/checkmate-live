package hub

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// fakeStore จดทุกอย่างที่ห้องส่งมาเก็บ
type fakeStore struct {
	mu      sync.Mutex
	rooms   []RoomSnapshot
	deleted []string
	games   []GameRecord
}

func (s *fakeStore) SaveRoom(snap RoomSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rooms = append(s.rooms, snap)
}

func (s *fakeStore) DeleteRoom(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deleted = append(s.deleted, id)
}

func (s *fakeStore) SaveGame(g GameRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.games = append(s.games, g)
}

func (s *fakeStore) lastRoom(t *testing.T) RoomSnapshot {
	t.Helper()
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.rooms) == 0 {
		t.Fatal("no room snapshot was saved")
	}
	return s.rooms[len(s.rooms)-1]
}

func (s *fakeStore) counts() (rooms, deleted, games int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.rooms), len(s.deleted), len(s.games)
}

func TestPersistLifecycle(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st})
	id, err := h.CreateRoomBy(TimeControl{Initial: 5 * time.Minute, Increment: 3 * time.Second}, "alice")
	if err != nil {
		t.Fatal(err)
	}
	r := h.room(id)

	created := st.lastRoom(t)
	if created.ID != id || created.Status != StatusWaiting || created.CreatedBy != "alice" || created.TimeControl != "5+3" {
		t.Fatalf("snapshot at creation = %+v", created)
	}

	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	alice.untilState("waiting", isStatus(StatusWaiting))
	if got := st.lastRoom(t); len(got.Seats) != 1 || got.Seats[0] != "alice" || got.Status != StatusWaiting {
		t.Fatalf("snapshot after first join = %+v", got)
	}

	bob.join(r)
	alice.untilState("playing", isStatus(StatusPlaying))
	started := st.lastRoom(t)
	if started.Status != StatusPlaying || started.White != "alice" || started.Black != "bob" || len(started.Seats) != 0 || started.StartedAt.IsZero() {
		t.Fatalf("snapshot at start = %+v", started)
	}

	alice.move(r, 0, "e2e4")
	bob.untilState("ply 1", atPly(1))
	bob.move(r, 1, "e7e5")
	alice.untilState("ply 2", atPly(2))
	moved := st.lastRoom(t)
	if strings.Join(moved.Moves, " ") != "e2e4 e7e5" || moved.ClockWhite <= 0 || moved.ClockBlack <= 0 {
		t.Fatalf("snapshot after moves = %+v", moved)
	}

	// คนดูเข้าออกไม่ทำให้เขียนฐานข้อมูล
	before, _, _ := st.counts()
	carol := newFakeClient(t, "carol")
	carol.join(r)
	carol.next()
	carol.leave(r)
	alice.untilState("carol gone", isStatus(StatusPlaying))
	if after, _, _ := st.counts(); after != before {
		t.Fatalf("spectator join/leave wrote %d snapshots", after-before)
	}

	bob.resign(r)
	alice.untilState("finished", isStatus(StatusFinished))
	if _, _, games := st.counts(); games != 1 {
		t.Fatalf("saved %d games, want exactly 1", games)
	}
	g := st.games[0]
	if g.RoomID != id || g.WhiteID != "alice" || g.BlackID != "bob" || g.Result != "1-0" || g.Reason != game.ReasonResign || g.TimeControl != "5+3" {
		t.Fatalf("game record = %+v", g)
	}
	if !strings.Contains(g.PGN, "e4") || !strings.Contains(g.PGN, "e5") || g.EndedAt.Before(g.StartedAt) || g.StartedAt.IsZero() {
		t.Fatalf("game record pgn/times = %+v", g)
	}
	if got := st.lastRoom(t); got.Status != StatusFinished {
		t.Fatalf("last snapshot status = %q, want finished", got.Status)
	}

	// ยอมแพ้ซ้ำหลังจบต้องไม่บันทึกเกมซ้ำ
	alice.resign(r)
	alice.move(r, 2, "a2a3")
	alice.expectError(errCodeGameNotActive)
	if _, _, games := st.counts(); games != 1 {
		t.Fatalf("game saved %d times", games)
	}
}

func TestIdleRoomIsDeletedFromStore(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st, IdleTTL: 30 * time.Millisecond})
	r := newTestRoom(t, h)
	select {
	case <-r.done:
	case <-time.After(testTimeout):
		t.Fatal("idle room was not closed")
	}
	if _, deleted, _ := st.counts(); deleted != 1 || st.deleted[0] != r.id {
		t.Fatalf("deleted = %v, want [%s]", st.deleted, r.id)
	}
}

func TestServerShutdownKeepsRoomsInStore(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st})
	startGame(t, h)
	h.Close()
	if _, deleted, _ := st.counts(); deleted != 0 {
		t.Fatalf("shutdown deleted %v; rooms must survive a restart", st.deleted)
	}
}

// restart จำลองการรีสตาร์ต: เอา snapshot ล่าสุดผ่าน JSON แบบเดียวกับที่ฐานข้อมูลเก็บ แล้วกู้ใน Hub ใหม่
func restart(t *testing.T, st *fakeStore, cfg Config) (*Hub, *Room) {
	t.Helper()
	saved := st.lastRoom(t)
	data, err := json.Marshal(saved)
	if err != nil {
		t.Fatal(err)
	}
	loaded := RoomSnapshot{ID: saved.ID, Status: saved.Status, CreatedBy: saved.CreatedBy, TimeControl: saved.TimeControl}
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	h := newTestHub(t, cfg)
	if err := h.RestoreRoom(loaded); err != nil {
		t.Fatalf("RestoreRoom: %v", err)
	}
	return h, h.room(saved.ID)
}

func TestRestoreContinuesGame(t *testing.T) {
	st := &fakeStore{}
	h1 := newTestHub(t, Config{Store: st})
	r1, alice, bob := startGame(t, h1)
	alice.move(r1, 0, "e2e4")
	bob.move(r1, 1, "e7e5")
	alice.move(r1, 2, "g1f3")
	final := bob.untilState("ply 3", atPly(3))
	h1.Close()

	_, r2 := restart(t, st, Config{})
	if r2.id != r1.id {
		t.Fatalf("room id changed: %s -> %s", r1.id, r2.id)
	}

	bob2 := newFakeClient(t, "bob")
	bob2.join(r2)
	st2 := bob2.next()
	if st2.FEN != final.FEN || st2.Ply != 3 || st2.Turn != game.Black || st2.Status != StatusPlaying {
		t.Fatalf("restored state = %+v, want fen %s at ply 3", st2, final.FEN)
	}
	if st2.You != (youInfo{Role: rolePlayer, Color: game.Black}) {
		t.Fatalf("bob's seat after restore = %+v", st2.You)
	}
	if st2.LastMove == nil || *st2.LastMove != (moveInfo{From: "g1", To: "f3"}) {
		t.Fatalf("last move after restore = %+v", st2.LastMove)
	}
	if st2.Clock.Running != game.Black || st2.TC != "10+0" {
		t.Fatalf("clock after restore = %+v tc=%s", st2.Clock, st2.TC)
	}
	// alice ยังไม่กลับมา: ต้องเห็นว่าหลุดอยู่และมีเวลาผ่อนผัน
	if p := st2.Players[game.White]; p.Connected || p.GraceLeft < 1 {
		t.Fatalf("white after restore = %+v, want disconnected with grace", p)
	}

	alice2 := newFakeClient(t, "alice")
	alice2.join(r2)
	bob2.untilState("alice back", func(m serverMsg) bool { return m.Players[game.White].Connected })

	bob2.move(r2, 3, "b8c6")
	alice2.untilState("ply 4", atPly(4))

	// คนอื่นที่ไม่ใช่ผู้เล่นเดิมได้เป็นแค่ผู้ชม
	mallory := newFakeClient(t, "mallory")
	mallory.join(r2)
	if got := mallory.next(); got.You.Role != roleSpectator {
		t.Fatalf("stranger after restore = %+v", got.You)
	}
}

func TestRestoreDoesNotChargeDowntime(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		st := &fakeStore{}
		h1 := newTestHub(t, Config{Store: st, AbandonGrace: 24 * time.Hour})
		id, _ := h1.CreateRoom(TimeControl{Initial: 5 * time.Minute})
		r1 := h1.room(id)
		alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
		alice.join(r1)
		synctest.Wait()
		bob.join(r1)
		synctest.Wait()

		time.Sleep(30 * time.Second)
		alice.move(r1, 0, "e2e4") // ขาวเหลือ 4:30
		synctest.Wait()
		h1.Close()

		time.Sleep(2 * time.Hour) // เซิร์ฟเวอร์ดับไปสองชั่วโมง

		_, r2 := restart(t, st, Config{AbandonGrace: 24 * time.Hour})
		bob2 := newFakeClient(t, "bob")
		bob2.join(r2)
		synctest.Wait()
		got := bob2.lastState()
		if got.Clock != (clockInfo{White: 270_000, Black: 300_000, Running: game.Black}) {
			t.Fatalf("clock after downtime = %+v, want w=4:30 b=5:00 running b", got.Clock)
		}
	})
}

func TestRestoredGameAbandonedBySideToMove(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		st := &fakeStore{}
		h1 := newTestHub(t, Config{Store: st})
		id, _ := h1.CreateRoom(TimeControl{Initial: time.Hour})
		r1 := h1.room(id)
		alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
		alice.join(r1)
		synctest.Wait()
		bob.join(r1)
		synctest.Wait()
		alice.move(r1, 0, "e2e4") // ถึงตาดำ
		synctest.Wait()
		h1.Close()

		st2 := &fakeStore{}
		_, r2 := restart(t, st, Config{Store: st2})
		carol := newFakeClient(t, "carol") // ผู้ชมเป็นพยาน
		carol.join(r2)
		synctest.Wait()
		carol.drain()

		time.Sleep(59 * time.Second)
		synctest.Wait()
		if msgs := carol.drain(); len(msgs) != 0 {
			t.Fatalf("game changed before the grace period ended: %+v", msgs)
		}
		time.Sleep(time.Second)
		synctest.Wait()
		msgs := carol.drain()
		if len(msgs) == 0 || msgs[0].Type != "game_over" || msgs[0].Result != "1-0" || msgs[0].Reason != game.ReasonAbandon {
			t.Fatalf("nobody returned: want 1-0 by abandon (black was to move), got %+v", msgs)
		}
		if _, _, games := st2.counts(); games != 1 {
			t.Fatalf("abandoned restored game saved %d times", games)
		}
	})
}

func TestRestoreWaitingRoom(t *testing.T) {
	st := &fakeStore{}
	h1 := newTestHub(t, Config{Store: st})
	r1 := newTestRoom(t, h1)
	alice := newFakeClient(t, "alice")
	alice.join(r1)
	alice.next()
	h1.Close()

	_, r2 := restart(t, st, Config{})
	bob := newFakeClient(t, "bob")
	bob.join(r2)
	// alice จองที่นั่งแรกไว้แล้ว bob จึงเป็นคนที่สองและเกมเริ่มทันที
	started := bob.untilState("playing", isStatus(StatusPlaying))
	if started.You != (youInfo{Role: rolePlayer, Color: game.Black}) {
		t.Fatalf("bob = %+v, want black (alice kept the first seat)", started.You)
	}
}

func TestRestoreRejectsBadSnapshots(t *testing.T) {
	good := RoomSnapshot{
		ID: "482915", Status: StatusPlaying, TimeControl: "10+0",
		White: "alice", Black: "bob", Moves: []string{"e2e4", "e7e5"},
		ClockWhite: 600_000, ClockBlack: 600_000, StartedAt: time.Now(),
	}
	h := newTestHub(t, Config{})
	if err := h.RestoreRoom(good); err != nil {
		t.Fatalf("valid snapshot rejected: %v", err)
	}
	if err := h.RestoreRoom(good); !errors.Is(err, ErrBadSnapshot) {
		t.Fatalf("duplicate room: err = %v", err)
	}

	bad := map[string]func(*RoomSnapshot){
		"bad id":             func(s *RoomSnapshot) { s.ID = "../etc" },
		"bad time control":   func(s *RoomSnapshot) { s.TimeControl = "fast" },
		"unknown status":     func(s *RoomSnapshot) { s.Status = "paused" },
		"finished":           func(s *RoomSnapshot) { s.Status = StatusFinished },
		"illegal move":       func(s *RoomSnapshot) { s.Moves = []string{"e2e5"} },
		"garbage move":       func(s *RoomSnapshot) { s.Moves = []string{"hello"} },
		"missing player":     func(s *RoomSnapshot) { s.Black = "" },
		"same player twice":  func(s *RoomSnapshot) { s.Black = "alice" },
		"expired clock":      func(s *RoomSnapshot) { s.ClockWhite = 0 },
		"game already over":  func(s *RoomSnapshot) { s.Moves = []string{"f2f3", "e7e5", "g2g4", "d8h4"} },
		"waiting with moves": func(s *RoomSnapshot) { s.Status = StatusWaiting },
	}
	for name, edit := range bad {
		snap := good
		snap.ID = "999999"
		edit(&snap)
		if err := h.RestoreRoom(snap); !errors.Is(err, ErrBadSnapshot) {
			t.Errorf("%s: err = %v, want ErrBadSnapshot", name, err)
		}
	}
	if h.RoomCount() != 1 {
		t.Fatalf("rejected snapshots left rooms behind: %d rooms", h.RoomCount())
	}
}

func TestRestoreAfterCloseFails(t *testing.T) {
	h := newTestHub(t, Config{})
	h.Close()
	err := h.RestoreRoom(RoomSnapshot{ID: "482915", Status: StatusWaiting, TimeControl: "10+0"})
	if !errors.Is(err, ErrClosed) {
		t.Fatalf("err = %v, want ErrClosed", err)
	}
}

func TestMoveEncoding(t *testing.T) {
	for _, s := range []string{"e2e4", "e7e8q", "a7a8n"} {
		m, err := decodeMove(s)
		if err != nil || encodeMove(m) != s {
			t.Errorf("%q: round trip gave %q, %v", s, encodeMove(m), err)
		}
	}
	for _, s := range []string{"", "e2", "e2e4qq", "e2e9", "e7e8k", "E2E4"} {
		if _, err := decodeMove(s); err == nil {
			t.Errorf("%q: accepted", s)
		}
	}
}
