package hub

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
)

func TestNoTimeControlParsesAndPrints(t *testing.T) {
	tc, err := ParseTimeControl(NoTimeControl)
	if err != nil || !tc.Unlimited || tc.Initial != 0 || tc.Increment != 0 {
		t.Fatalf("ParseTimeControl(none) = %+v, %v", tc, err)
	}
	if tc.String() != NoTimeControl {
		t.Fatalf("String() = %q", tc.String())
	}
}

func TestUntimedClockNeverFlags(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	k := newClock(TimeControl{Unlimited: true})
	k.start(game.White, t0)
	if _, ok := k.flagAt(); ok {
		t.Fatal("an untimed clock has a flag time")
	}
	k.press(t0.Add(48 * time.Hour))
	if k.running != game.Black {
		t.Fatalf("running = %q after white's move", k.running)
	}
	if _, ok := k.flagAt(); ok {
		t.Fatal("an untimed clock has a flag time after a move")
	}
}

func TestUntimedGameIsPlayedAndRestored(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st})
	id, err := h.CreateRoom(TimeControl{Unlimited: true})
	if err != nil {
		t.Fatal(err)
	}
	r := h.room(id)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if start.TC != NoTimeControl {
		t.Fatalf("tc = %q", start.TC)
	}
	// ห้องที่ไม่จับเวลาไม่มีเวลาที่ต้องตื่นมาตัดสินหมดเวลา
	alice.move(r, 0, "e2e4")
	after := bob.untilState("ply 1", atPly(1))
	if after.Status != StatusPlaying || after.Clock.Running != game.Black {
		t.Fatalf("after a move: status=%s clock=%+v", after.Status, after.Clock)
	}

	// กู้คืนได้ แม้เวลาบนนาฬิกาเป็น 0 (ห้องจับเวลาที่เวลาเป็น 0 ถูกปฏิเสธ)
	snap := st.lastRoom(t)
	if snap.TimeControl != NoTimeControl {
		t.Fatalf("snapshot time control = %q", snap.TimeControl)
	}
	restored, err := newTestHub(t, Config{}).roomFromSnapshot(snap)
	if err != nil {
		t.Fatalf("restore: %v", err)
	}
	if !restored.clock.tc.Unlimited || restored.status != StatusPlaying {
		t.Fatalf("restored: tc=%+v status=%s", restored.clock.tc, restored.status)
	}
	if _, ok := restored.clock.flagAt(); ok {
		t.Fatal("restored untimed room has a flag time")
	}
}

func (f *fakeClient) pickSet(r *Room, set string) {
	r.post(event{kind: evSet, client: f.Client, text: set})
}

func TestPlayersSetsAreChosenInTheLobbyOnly(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st, Lobby: true, LobbyCountdown: -1})
	r := newTestRoom(t, h)
	alice, bob, carol := newFakeClient(t, "alice"), newFakeClient(t, "bob"), newFakeClient(t, "carol")
	alice.join(r)
	bob.join(r)
	carol.join(r)
	alice.lobbyState("two seats", seats(2))

	alice.pickSet(r, "mint")
	// อีกคนในห้องรอเห็นชุดที่เลือกทันที (ที่นั่งแสดงตัวละครของชุดนั้น)
	seen := bob.untilState("alice picked mint", func(m serverMsg) bool {
		return m.Lobby != nil && len(m.Lobby.Seats) == 2 && m.Lobby.Seats[0].Set == "mint"
	})
	if seen.Lobby.Seats[1].Set != "" {
		t.Fatalf("bob has not picked a set, got %q", seen.Lobby.Seats[1].Set)
	}
	alice.pickSet(r, "cocoa") // เปลี่ยนใจได้ระหว่างรอ
	carol.pickSet(r, "grape") // ผู้ชมเลือกไม่ได้
	alice.ready(r, true)
	bob.ready(r, true)

	start := bob.untilState("playing", isStatus(StatusPlaying))
	if got := start.Players[game.White].Set; got != "cocoa" {
		t.Fatalf("white's set = %q, want cocoa", got)
	}
	if got := start.Players[game.Black].Set; got != "" {
		t.Fatalf("black never picked a set, got %q", got)
	}

	// เกมเริ่มแล้ว: เปลี่ยนไม่ได้
	bob.pickSet(r, "sky")
	alice.pickSet(r, "sky")
	alice.move(r, 0, "e2e4")
	after := bob.untilState("ply 1", atPly(1))
	if after.Players[game.White].Set != "cocoa" || after.Players[game.Black].Set != "" {
		t.Fatalf("sets changed during the game: %+v %+v", after.Players[game.White], after.Players[game.Black])
	}

	// ชุดที่เลือกอยู่รอดหลังเซิร์ฟเวอร์เริ่มใหม่
	restored, err := newTestHub(t, Config{Lobby: true}).roomFromSnapshot(st.lastRoom(t))
	if err != nil {
		t.Fatal(err)
	}
	if restored.sets["alice"] != "cocoa" || len(restored.sets) != 1 {
		t.Fatalf("restored sets = %v", restored.sets)
	}
}

func TestSetMessageIsValidated(t *testing.T) {
	if m, err := decodeInbound([]byte(`{"type":"set","set":"sky"}`)); err != nil || m.Set != "sky" {
		t.Fatalf("valid set message: %+v, %v", m, err)
	}
	for _, bad := range []string{
		`{"type":"set"}`,
		`{"type":"set","set":""}`,
		`{"type":"set","set":"<b>"}`,
		`{"type":"set","set":"SKY"}`,
		`{"type":"set","set":"aaaaaaaaaaaaaaaaaaaaaaaaa"}`,
		`{"type":"set","set":"sky","room":"K7Q2XM"}`,
		`{"type":"ready","ready":true,"set":"sky"}`,
	} {
		if _, err := decodeInbound([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}

func TestStateListsTheSpectators(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, _ := startGame(t, h)

	carol := newFakeClient(t, "carol")
	carol.Profile = PlayerProfile{Name: "Carol", Avatar: "a3"}
	carol.join(r)
	one := alice.untilState("one spectator", func(m serverMsg) bool { return m.Watching == 1 })
	if len(one.Spectators) != 1 || one.Spectators[0].Name != "Carol" || one.Spectators[0].Avatar != "a3" {
		t.Fatalf("spectators = %+v", one.Spectators)
	}

	// แท็บที่สองของคนเดิมไม่นับเพิ่ม และผู้เล่นไม่อยู่ในรายชื่อผู้ชม
	carolTab := newFakeClient(t, "carol")
	carolTab.Profile = carol.Profile
	carolTab.join(r)
	dave := newFakeClient(t, "dave")
	dave.join(r)
	two := alice.untilState("two spectators", func(m serverMsg) bool { return m.Watching == 2 })
	if len(two.Spectators) != 2 {
		t.Fatalf("spectators = %+v", two.Spectators)
	}

	carol.leave(r)
	dave.leave(r)
	still := alice.untilState("carol still watching in her other tab", func(m serverMsg) bool { return m.Watching == 1 })
	if len(still.Spectators) != 1 || still.Spectators[0].Name != "Carol" {
		t.Fatalf("spectators = %+v", still.Spectators)
	}
	carolTab.leave(r)
	alice.untilState("nobody watching", func(m serverMsg) bool { return m.Watching == 0 && len(m.Spectators) == 0 })
}

func TestFinishedRoomClosesAfterAWhileEvenWithPeopleInIt(t *testing.T) {
	h := newTestHub(t, Config{FinishedTTL: 80 * time.Millisecond})
	r, alice, bob := startGame(t, h)

	alice.move(r, 0, "e2e4")
	if playing := bob.untilState("ply 1", atPly(1)); playing.CloseIn != 0 {
		t.Fatalf("closeIn during the game = %d", playing.CloseIn)
	}

	r.post(event{kind: evResign, client: alice.Client})
	done := bob.untilState("finished", isStatus(StatusFinished))
	if done.CloseIn <= 0 || done.CloseIn > 80 {
		t.Fatalf("closeIn after the game = %d, want 1..80", done.CloseIn)
	}

	// ทั้งสองคนยังอยู่ในห้อง แต่ห้องปิดเองเมื่อครบเวลา
	select {
	case <-r.done:
	case <-time.After(testTimeout):
		t.Fatal("the finished room never closed")
	}
	waitFor(t, "room removed from the hub", func() bool { return h.room(r.id) == nil })
	select {
	case <-bob.kicked:
	case <-time.After(testTimeout):
		t.Fatal("players were not disconnected when the room closed")
	}
}

func TestRoomExistsIsRateLimitedLikeJoining(t *testing.T) {
	h := newTestHub(t, Config{JoinRate: ratelimit.Rule{Every: time.Hour, Burst: 2}})
	r := newTestRoom(t, h)
	req := httptest.NewRequest("GET", "/api/rooms/"+r.id, nil)

	if exists, allowed := h.RoomExists(req, r.id); !exists || !allowed {
		t.Fatalf("existing room: exists=%v allowed=%v", exists, allowed)
	}
	if exists, allowed := h.RoomExists(req, "ZZZZ99"); exists || !allowed {
		t.Fatalf("missing room: exists=%v allowed=%v", exists, allowed)
	}
	// เกินโควตา: ไม่บอกว่ามีห้องหรือไม่ แม้รหัสจะถูก
	if exists, allowed := h.RoomExists(req, r.id); exists || allowed {
		t.Fatalf("over the quota: exists=%v allowed=%v", exists, allowed)
	}
}

func (f *fakeClient) rematch(r *Room) {
	r.post(event{kind: evRematch, client: f.Client})
}

func TestRematchNeedsBothPlayersAndDrawsSidesAgain(t *testing.T) {
	st := &fakeStore{}
	flips := 0
	// เกมแรก: alice ขาว (ไม่สลับ) เกมที่สอง: สลับ ให้เห็นว่าสุ่มฝ่ายใหม่จริง
	h := newTestHub(t, Config{Store: st, CoinFlip: func() bool { flips++; return flips > 1 }})
	r, alice, bob := startGame(t, h)
	carol := newFakeClient(t, "carol")
	carol.join(r)

	alice.move(r, 0, "e2e4")
	bob.untilState("ply 1", atPly(1))
	r.post(event{kind: evResign, client: bob.Client})
	alice.untilState("finished", isStatus(StatusFinished))

	// ผู้ชมกดไม่มีผล คนเดียวกดเกมยังไม่เริ่ม แต่อีกฝ่ายเห็นว่ามีคนรอ
	carol.rematch(r)
	alice.rematch(r)
	alice.rematch(r) // กดซ้ำไม่มีผล
	waiting := bob.untilState("alice wants a rematch", func(m serverMsg) bool { return len(m.Rematch) == 1 })
	if waiting.Status != StatusFinished || waiting.Rematch[0] != game.White || waiting.CloseIn <= 0 {
		t.Fatalf("after one player asked: status=%s rematch=%v closeIn=%d", waiting.Status, waiting.Rematch, waiting.CloseIn)
	}

	bob.rematch(r)
	again := bob.untilState("second game", func(m serverMsg) bool { return m.Status == StatusPlaying && m.Round == 1 })
	if again.Ply != 0 || again.LastMove != nil || again.Result != "" || again.CloseIn != 0 || len(again.Rematch) != 0 {
		t.Fatalf("second game state: %+v", again)
	}
	if again.You.Color != game.White {
		t.Fatalf("sides were not drawn again: bob is %q, want white", again.You.Color)
	}
	// นาฬิกาเริ่มนับทันทีใน test นี้ (ไม่มี StartDelay) จึงยอมให้เดินไปแล้วเล็กน้อย
	full := DefaultTimeControl.Initial.Milliseconds()
	if again.Clock.White < full-1000 || again.Clock.Black != full || again.Clock.Running != game.White {
		t.Fatalf("clock was not reset: %+v", again.Clock)
	}
	if snap := st.lastRoom(t); snap.Status != StatusPlaying || snap.White != "bob" || len(snap.Moves) != 0 {
		t.Fatalf("snapshot after the rematch: %+v", snap)
	}

	// เกมที่สองเล่นและจบได้ตามปกติ และถูกบันทึกเป็นอีกเกมหนึ่ง
	bob.move(r, 0, "d2d4")
	alice.untilState("ply 1 of the second game", func(m serverMsg) bool { return m.Round == 1 && m.Ply == 1 })
	r.post(event{kind: evResign, client: alice.Client})
	bob.untilState("second game finished", func(m serverMsg) bool { return m.Round == 1 && m.Status == StatusFinished })
	waitFor(t, "two saved games", func() bool { _, _, games := st.counts(); return games == 2 })
}

func TestRematchVoteIsDroppedWhenThePlayerLeaves(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	r.post(event{kind: evResign, client: bob.Client})
	alice.untilState("finished", isStatus(StatusFinished))

	alice.rematch(r)
	bob.untilState("alice asked", func(m serverMsg) bool { return len(m.Rematch) == 1 })
	alice.leave(r)
	bob.untilState("alice left", func(m serverMsg) bool { return m.Status == StatusFinished && len(m.Rematch) == 0 })
	// อีกคนกดทีหลัง: ยังไม่เริ่ม เพราะคนแรกไม่อยู่แล้ว
	bob.rematch(r)
	still := bob.untilState("bob asked", func(m serverMsg) bool { return len(m.Rematch) == 1 })
	if still.Status != StatusFinished || still.Rematch[0] != game.Black {
		t.Fatalf("state = %s %v", still.Status, still.Rematch)
	}
}
