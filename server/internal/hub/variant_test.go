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

func TestCheckersMultiJumpKeepsTheClock(t *testing.T) {
	h := newTestHub(t, Config{})
	id, err := h.CreateGameRoom(game.VariantCheckers, TimeControl{}, "")
	if err != nil {
		t.Fatal(err)
	}
	r := h.room(id)
	// ตั้งตำแหน่งก่อนมีใครเข้าห้อง: เบี้ยขาวที่ c3 กินได้สองต่อ
	g, err := game.NewCheckersFromFEN("8/c7/5c2/8/3c4/2C5/8/8 w")
	if err != nil {
		t.Fatal(err)
	}
	r.game = g

	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if start.Game != game.VariantCheckers || !start.Forced || len(start.Legal) != 1 {
		t.Fatalf("start state: game=%q forced=%v legal=%v", start.Game, start.Forced, start.Legal)
	}

	alice.move(r, 0, "c3e5")
	mid := bob.untilState("ply 1", atPly(1))
	if mid.Turn != game.White || mid.Clock.Running != game.White || !mid.Forced {
		t.Fatalf("mid-chain: turn=%q clock=%q forced=%v, want white to keep the move and the clock", mid.Turn, mid.Clock.Running, mid.Forced)
	}
	// อีกฝ่ายยังเดินไม่ได้ระหว่างที่กินไม่จบ
	bob.move(r, 1, "a7b6")
	bob.expectError(errCodeNotYourTurn)

	alice.move(r, 1, "e5g7")
	end := bob.untilState("ply 2", atPly(2))
	if end.Turn != game.Black || end.Clock.Running != game.Black || end.Forced {
		t.Fatalf("after the chain: turn=%q clock=%q forced=%v", end.Turn, end.Clock.Running, end.Forced)
	}
}

func TestNeebRoomCapturesByCustodian(t *testing.T) {
	st := &fakeStore{}
	h := newTestHub(t, Config{Store: st})
	id, err := h.CreateGameRoom(game.VariantNeeb, TimeControl{}, "")
	if err != nil {
		t.Fatal(err)
	}
	r := h.room(id)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	bob.join(r)
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if start.Game != game.VariantNeeb || start.FEN != "oooooooo/8/8/8/8/8/8/OOOOOOOO w" || len(start.Legal) != 8 || start.Forced {
		t.Fatalf("start state: game=%q fen=%q legal=%d forced=%v", start.Game, start.FEN, len(start.Legal), start.Forced)
	}

	// หมากหนีบเดินแนวตรงเท่านั้น
	alice.move(r, 0, "a1b2")
	alice.expectError(errCodeIllegalMove)
	alice.move(r, 0, "a1a7")
	after := bob.untilState("ply 1", atPly(1))
	if after.Turn != game.Black || after.Clock.Running != game.Black || after.FEN != "oooooooo/O7/8/8/8/8/8/1OOOOOOO b" {
		t.Fatalf("state after a1a7: %+v", after)
	}
	// ดำเดิน b8-b7 มาอยู่ข้างหมากขาวที่ a7 (การเดินเข้าไปเองไม่กินใคร)
	bob.move(r, 1, "b8b7")
	alice.untilState("ply 2", atPly(2))
	// ขาว c1-c7: หนีบ b7 ระหว่าง a7 กับ c7
	alice.move(r, 2, "c1c7")
	captured := bob.untilState("ply 3", atPly(3))
	if captured.FEN != "o1oooooo/O1O5/8/8/8/8/8/1O1OOOOO b" {
		t.Fatalf("after the custodian capture: %q", captured.FEN)
	}
	if snap := st.lastRoom(t); snap.Variant != "neeb" || len(snap.Moves) != 3 {
		t.Fatalf("snapshot = %+v", snap)
	}
}
