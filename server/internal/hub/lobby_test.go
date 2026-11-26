package hub

import (
	"slices"
	"testing"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

func (f *fakeClient) ready(r *Room, ready bool) {
	r.post(event{kind: evReady, client: f.Client, ready: ready})
}

// lobbyState รอ state ของห้องรอที่ตรงเงื่อนไข
func (f *fakeClient) lobbyState(what string, match func(*lobbyInfo) bool) serverMsg {
	f.t.Helper()
	return f.until(what, func(m serverMsg) bool {
		return m.Type == "state" && m.Status == StatusWaiting && m.Lobby != nil && match(m.Lobby)
	})
}

func seats(n int) func(*lobbyInfo) bool {
	return func(l *lobbyInfo) bool { return len(l.Seats) == n }
}

func readyCount(n int) func(*lobbyInfo) bool {
	return func(l *lobbyInfo) bool {
		count := 0
		for _, s := range l.Seats {
			if s.Ready {
				count++
			}
		}
		return count == n
	}
}

func newLobbyRoom(t *testing.T, countdown time.Duration) (*Hub, *Room) {
	t.Helper()
	h := newTestHub(t, Config{Lobby: true, LobbyCountdown: countdown})
	return h, newTestRoom(t, h)
}

func TestLobbyWaitsForBothPlayersToBeReady(t *testing.T) {
	_, r := newLobbyRoom(t, 40*time.Millisecond)
	alice, bob, carol := newFakeClient(t, "alice"), newFakeClient(t, "bob"), newFakeClient(t, "carol")

	alice.join(r)
	first := alice.lobbyState("one seat", seats(1))
	if !first.Lobby.Seats[0].You || first.Lobby.Seats[0].Ready || first.You.Role != rolePlayer || first.You.Color != "" {
		t.Fatalf("first player in the lobby: %+v you=%+v", first.Lobby.Seats, first.You)
	}

	// คนที่สองเข้ามา: เกมยังไม่เริ่ม (ต่างจากเดิมที่เริ่มทันที)
	bob.join(r)
	two := bob.lobbyState("two seats", seats(2))
	if two.Lobby.Seats[0].You || !two.Lobby.Seats[1].You || two.Lobby.Countdown != 0 {
		t.Fatalf("second player sees: %+v", two.Lobby)
	}
	// คนที่สามเป็นผู้ชม ไม่มีที่นั่ง
	carol.join(r)
	watch := carol.lobbyState("spectator view", seats(2))
	if watch.You.Role != roleSpectator || watch.Lobby.Seats[0].You || watch.Lobby.Seats[1].You {
		t.Fatalf("spectator in the lobby: you=%+v seats=%+v", watch.You, watch.Lobby.Seats)
	}
	// ผู้ชมกดพร้อมไม่มีผล
	carol.ready(r, true)

	alice.ready(r, true)
	one := bob.lobbyState("alice ready", readyCount(1))
	if !one.Lobby.Seats[0].Ready || one.Lobby.Seats[1].Ready || one.Lobby.Countdown != 0 {
		t.Fatalf("after one ready: %+v", one.Lobby)
	}

	// ครบสองคน: เริ่มนับถอยหลัง แล้วเกมเริ่มเอง
	bob.ready(r, true)
	counting := alice.lobbyState("countdown", func(l *lobbyInfo) bool { return l.Countdown > 0 })
	if counting.Lobby.Countdown > 40 || !readyCount(2)(counting.Lobby) {
		t.Fatalf("countdown state: %+v", counting.Lobby)
	}
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if start.Lobby != nil || start.Players[game.White] == nil || start.Players[game.Black] == nil {
		t.Fatalf("state after the countdown: lobby=%v players=%v", start.Lobby, start.Players)
	}
	if carol.untilState("playing for the spectator", isStatus(StatusPlaying)).You.Role != roleSpectator {
		t.Fatal("the spectator got a seat")
	}
}

func TestLobbyCountdownStopsWhenSomeoneIsNotReady(t *testing.T) {
	_, r := newLobbyRoom(t, time.Hour) // นานพอที่จะไม่เริ่มเองใน test
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	alice.ready(r, true)
	bob.ready(r, true)
	alice.lobbyState("countdown", func(l *lobbyInfo) bool { return l.Countdown > 0 })

	// ยกเลิกพร้อม: หยุดนับ
	bob.ready(r, false)
	stopped := alice.lobbyState("countdown stopped", func(l *lobbyInfo) bool { return l.Countdown == 0 && readyCount(1)(l) })
	if stopped.Status != StatusWaiting {
		t.Fatalf("status = %q", stopped.Status)
	}

	// พร้อมอีกครั้ง แล้วออกจากห้อง: หยุดนับ และคนที่ออกถือว่าไม่พร้อม
	bob.ready(r, true)
	alice.lobbyState("countdown again", func(l *lobbyInfo) bool { return l.Countdown > 0 })
	bob.leave(r)
	left := alice.lobbyState("bob left", func(l *lobbyInfo) bool { return l.Countdown == 0 && len(l.Seats) == 2 && !l.Seats[1].Connected })
	if left.Lobby.Seats[1].Ready || !left.Lobby.Seats[0].Ready {
		t.Fatalf("after a player left: %+v", left.Lobby.Seats)
	}

	// คนที่ออกกลับมา: ได้ที่นั่งเดิม แต่ต้องกดพร้อมใหม่
	back := newFakeClient(t, "bob")
	back.join(r)
	again := back.lobbyState("bob back", func(l *lobbyInfo) bool { return len(l.Seats) == 2 && l.Seats[1].Connected })
	if !again.Lobby.Seats[1].You || again.Lobby.Seats[1].Ready || again.Lobby.Countdown != 0 {
		t.Fatalf("after coming back: %+v", again.Lobby)
	}
}

func TestLobbySeatOfAnAbsentPlayerGoesToTheNextPerson(t *testing.T) {
	_, r := newLobbyRoom(t, time.Hour)
	alice, bob, carol := newFakeClient(t, "alice"), newFakeClient(t, "bob"), newFakeClient(t, "carol")
	alice.join(r)
	bob.join(r)
	alice.lobbyState("two seats", seats(2))
	bob.leave(r)
	alice.lobbyState("bob away", func(l *lobbyInfo) bool { return len(l.Seats) == 2 && !l.Seats[1].Connected })

	// คนใหม่เข้ามาตอนที่นั่งเต็มแต่เจ้าของที่นั่งไม่อยู่: ได้ที่นั่งนั้น
	carol.join(r)
	got := carol.lobbyState("carol seated", func(l *lobbyInfo) bool { return len(l.Seats) == 2 && l.Seats[1].You })
	if got.You.Role != rolePlayer {
		t.Fatalf("carol = %+v", got.You)
	}
	// เจ้าของเดิมกลับมา: ที่นั่งถูกใช้แล้ว จึงเป็นผู้ชม
	late := newFakeClient(t, "bob")
	late.join(r)
	if st := late.lobbyState("bob as a spectator", seats(2)); st.You.Role != roleSpectator {
		t.Fatalf("the former seat holder = %+v, want spectator", st.You)
	}
	if !slices.Equal(r.seats, []string{"alice", "carol"}) {
		t.Fatalf("seats = %v", r.seats)
	}
}

func TestLobbyWithoutCountdownStartsAtOnce(t *testing.T) {
	_, r := newLobbyRoom(t, -1)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	alice.ready(r, true)
	bob.ready(r, true)
	alice.untilState("playing", isStatus(StatusPlaying))
	// กดพร้อมหลังเกมเริ่มไม่มีผลอะไร
	alice.ready(r, false)
	alice.move(r, 0, "e2e4")
	bob.untilState("ply 1", atPly(1))
}

func TestLobbyChatCarriesTheSeatTag(t *testing.T) {
	_, r := newLobbyRoom(t, time.Hour)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	st := alice.lobbyState("two seats", seats(2))
	tag := st.Lobby.Seats[1].Sender
	if tag == "" || tag == st.Lobby.Seats[0].Sender {
		t.Fatalf("seat tags: %+v", st.Lobby.Seats)
	}
	// แชทได้ตั้งแต่อยู่ในห้องรอ และข้อความมีเลขประจำตัวเดียวกับที่นั่ง หน้าเว็บจึงใส่ชื่อได้
	bob.chat(r, "สวัสดี")
	msg := alice.until("chat", func(m serverMsg) bool { return m.Type == "chat" })
	if msg.Text != "สวัสดี" || msg.Sender != tag || msg.Mine {
		t.Fatalf("lobby chat: %+v, want sender %q", msg, tag)
	}
}

func TestLobbySeatsSurviveARestart(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st, Lobby: true, LobbyCountdown: time.Hour})
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	alice.lobbyState("two seats", seats(2))
	alice.ready(r, true)
	alice.lobbyState("ready", readyCount(1))

	snap := st.lastRoom(t)
	if snap.Status != StatusWaiting || !slices.Equal(snap.Seats, []string{"alice", "bob"}) || snap.Pending != "" {
		t.Fatalf("snapshot = %+v", snap)
	}
	restored, err := newTestHub(t, Config{Lobby: true}).roomFromSnapshot(snap)
	if err != nil {
		t.Fatal(err)
	}
	// ที่นั่งกลับมา แต่ต้องกดพร้อมใหม่
	if !slices.Equal(restored.seats, []string{"alice", "bob"}) || len(restored.ready) != 0 || !restored.startAt.IsZero() {
		t.Fatalf("restored lobby: seats=%v ready=%v", restored.seats, restored.ready)
	}

	// snapshot รูปแบบเก่าที่มีแค่ pending ยังอ่านได้
	old, err := h.roomFromSnapshot(RoomSnapshot{ID: "482915", Status: StatusWaiting, TimeControl: "10+0", Pending: "alice"})
	if err != nil || !slices.Equal(old.seats, []string{"alice"}) {
		t.Fatalf("legacy snapshot: seats=%v err=%v", old.seats, err)
	}
	for name, seats := range map[string][]string{"three": {"a", "b", "c"}, "same twice": {"a", "a"}, "empty id": {"a", ""}} {
		if _, err := h.roomFromSnapshot(RoomSnapshot{ID: "482915", Status: StatusWaiting, TimeControl: "10+0", Seats: seats}); err == nil {
			t.Errorf("snapshot with %s seats was accepted", name)
		}
	}
}

func TestWithoutLobbyTheGameStartsWhenTheSecondPlayerJoins(t *testing.T) {
	h := newTestHub(t, Config{}) // Lobby ปิด: พฤติกรรมเดิม
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	if st := alice.untilState("waiting", isStatus(StatusWaiting)); st.Lobby != nil {
		t.Fatalf("lobby info without the lobby: %+v", st.Lobby)
	}
	bob.join(r)
	alice.untilState("playing", isStatus(StatusPlaying))
}

func TestDecodeReady(t *testing.T) {
	for _, ok := range []string{`{"type":"ready","ready":true}`, `{"type":"ready","ready":false}`} {
		if m, err := decodeInbound([]byte(ok)); err != nil || m.Type != msgReady || m.Ready == nil {
			t.Errorf("%s: %+v %v", ok, m, err)
		}
	}
	for _, bad := range []string{`{"type":"ready"}`, `{"type":"ready","ready":"yes"}`, `{"type":"ready","ready":true,"room":"482915"}`, `{"type":"resign","ready":true}`} {
		if _, err := decodeInbound([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}
