package hub

import (
	"slices"
	"strings"
	"testing"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

func newMakrukRoom(t *testing.T, h *Hub, createdBy string) *Room {
	t.Helper()
	id, err := h.CreateGameRoom(game.VariantMakruk, TimeControl{}, createdBy)
	if err != nil {
		t.Fatal(err)
	}
	return h.room(id)
}

func TestMakrukRoomSendsLegalMoves(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newMakrukRoom(t, h, "")
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	waiting := alice.untilState("waiting", isStatus(StatusWaiting))
	if waiting.Game != game.VariantMakruk || waiting.Legal != nil {
		t.Fatalf("waiting state: game=%q legal=%v", waiting.Game, waiting.Legal)
	}
	if !strings.HasPrefix(waiting.FEN, "rnsmksnr/8/pppppppp/") {
		t.Fatalf("FEN = %q, want the makruk start position", waiting.FEN)
	}
	bob.join(r)
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if !slices.Equal(start.Legal["e3"], []string{"e4"}) || len(start.Legal) != 16 {
		t.Fatalf("legal moves at the start = %v", start.Legal)
	}

	// ตาเดินแบบหมากรุกสากลที่หมากรุกไทยไม่มี ต้องถูกปฏิเสธ
	alice.move(r, 0, "e3e5")
	alice.expectError(errCodeIllegalMove)

	alice.move(r, 0, "e3e4")
	after := bob.untilState("ply 1", atPly(1))
	if after.Turn != game.Black || !slices.Equal(after.Legal["e6"], []string{"e5"}) {
		t.Fatalf("state after e3e4: turn=%q legal[e6]=%v", after.Turn, after.Legal["e6"])
	}
}

func TestChessRoomHasNoLegalList(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	st := alice.untilState("playing", isStatus(StatusPlaying))
	if st.Game != game.VariantChess || st.Legal != nil || st.Check != "" || st.Count != nil {
		t.Fatalf("chess state: game=%q legal=%v check=%q count=%v", st.Game, st.Legal, st.Check, st.Count)
	}
}

func TestMakrukRoomSurvivesRestart(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st})
	r := newMakrukRoom(t, h, "alice")
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	alice.untilState("playing", isStatus(StatusPlaying))
	alice.move(r, 0, "e3e4")
	bob.untilState("ply 1", atPly(1))
	bob.move(r, 1, "e6e5")
	alice.untilState("ply 2", atPly(2))

	snap := st.lastRoom(t)
	if snap.Variant != "makruk" || strings.Join(snap.Moves, " ") != "e3e4 e6e5" {
		t.Fatalf("snapshot = %+v", snap)
	}

	restored, err := newTestHub(t, Config{}).roomFromSnapshot(snap)
	if err != nil {
		t.Fatal(err)
	}
	if restored.game.Variant() != game.VariantMakruk || restored.game.FEN() != r.game.FEN() {
		t.Fatalf("restored game = %s %q", restored.game.Variant(), restored.game.FEN())
	}

	// ตาเดินของหมากรุกไทยใช้กับกติกาหมากรุกสากลไม่ได้ ชนิดของเกมจึงต้องถูกเก็บไว้เสมอ
	snap.Variant = "checkers"
	if _, err := h.roomFromSnapshot(snap); err == nil {
		t.Fatal("snapshot with an unknown game was accepted")
	}

	bob.resign(r)
	alice.untilState("finished", isStatus(StatusFinished))
	if g := st.games[0]; g.Variant != "makruk" || !strings.Contains(g.PGN, "e3e4 e6e5") {
		t.Fatalf("game record = %+v", g)
	}
}
