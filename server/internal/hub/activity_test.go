package hub

import (
	"testing"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

func TestActivityFollowsTheRoom(t *testing.T) {
	h, r := newLobbyRoom(t, -1)
	alice, bob, carol := newFakeClient(t, "alice"), newFakeClient(t, "bob"), newFakeClient(t, "carol")
	if got := h.Activity(); len(got) != 0 {
		t.Fatalf("an empty room has activity: %+v", got)
	}

	// นั่งรอคนเดียว
	alice.join(r)
	alice.lobbyState("one seat", seats(1))
	a := h.Activity()["alice"]
	if a.Status != StatusWaiting || a.Room != r.id || a.Game != game.VariantChess || !a.Connected || a.Opponent != "" {
		t.Fatalf("waiting alone: %+v", a)
	}

	// คนที่สองนั่ง คนที่สามเป็นผู้ชม (ไม่นับเป็นกิจกรรม)
	bob.join(r)
	carol.join(r)
	carol.lobbyState("spectator", seats(2))
	got := h.Activity()
	if len(got) != 2 || got["alice"].Opponent != "bob" || got["bob"].Opponent != "alice" || got["bob"].Status != StatusWaiting {
		t.Fatalf("two seated and one watching: %+v", got)
	}

	// เริ่มเล่น
	alice.ready(r, true)
	bob.ready(r, true)
	alice.untilState("playing", isStatus(StatusPlaying))
	got = h.Activity()
	if len(got) != 2 || got["alice"].Status != StatusPlaying || got["bob"].Status != StatusPlaying || got["alice"].Opponent != "bob" {
		t.Fatalf("playing: %+v", got)
	}

	// หลุดระหว่างเกม: ยังนับว่าเล่นอยู่ แต่ไม่ได้เชื่อมต่อ
	bob.leave(r)
	alice.untilState("bob away", func(m serverMsg) bool {
		for _, p := range m.Players {
			if !p.Connected {
				return true
			}
		}
		return false
	})
	got = h.Activity()
	if got["bob"].Status != StatusPlaying || got["bob"].Connected || !got["alice"].Connected {
		t.Fatalf("a player dropped: %+v", got)
	}

	// เกมจบ: ไม่มีใครกำลังเล่น
	r.post(event{kind: evResign, client: alice.Client})
	alice.untilState("finished", isStatus(StatusFinished))
	if got := h.Activity(); len(got) != 0 {
		t.Fatalf("activity after the game ended: %+v", got)
	}
}

func TestActivityPrefersTheRoomBeingPlayed(t *testing.T) {
	h := newTestHub(t, Config{Lobby: true, LobbyCountdown: -1})
	waiting, playing := newTestRoom(t, h), newTestRoom(t, h)

	// alice นั่งรอในห้องหนึ่ง แล้วไปเล่นอยู่อีกห้องหนึ่ง
	first := newFakeClient(t, "alice")
	first.join(waiting)
	first.lobbyState("waiting room", seats(1))
	if a := h.Activity()["alice"]; a.Status != StatusWaiting || a.Room != waiting.id {
		t.Fatalf("before any game started: %+v", a)
	}

	second, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	second.join(playing)
	bob.join(playing)
	second.ready(playing, true)
	bob.ready(playing, true)
	bob.untilState("playing", isStatus(StatusPlaying))
	if a := h.Activity()["alice"]; a.Status != StatusPlaying || a.Room != playing.id || a.Opponent != "bob" {
		t.Fatalf("playing in one room and waiting in another: %+v", a)
	}

	if !moreActive(Activity{Status: StatusWaiting, Connected: true}, Activity{Status: StatusWaiting}) ||
		moreActive(Activity{Status: StatusWaiting}, Activity{Status: StatusWaiting}) {
		t.Fatal("between two rooms of the same kind, the connected one wins")
	}
}

func TestActivityOfARestoredRoom(t *testing.T) {
	h := newTestHub(t, Config{})
	err := h.RestoreRoom(RoomSnapshot{
		ID: "482915", Status: StatusPlaying, TimeControl: "10+0", White: "alice", Black: "bob",
		ClockWhite: 600_000, ClockBlack: 600_000, StartedAt: time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}
	// เพิ่งกู้ห้องคืนหลังรีสตาร์ต: ผู้เล่นยังไม่กลับเข้ามา แต่เกมยังเดินอยู่
	got := h.Activity()
	if got["alice"].Status != StatusPlaying || got["alice"].Connected || got["bob"].Opponent != "alice" {
		t.Fatalf("restored room: %+v", got)
	}
}
