package game

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

func mustCheckers(t *testing.T, fen string) *Checkers {
	t.Helper()
	g, err := NewCheckersFromFEN(fen)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func sortedLegal(g Engine, from string) string {
	got := slices.Clone(g.Legal()[from])
	slices.Sort(got)
	return strings.Join(got, " ")
}

func TestCheckersStart(t *testing.T) {
	g := NewCheckers()
	if got, want := g.FEN(), "1c1c1c1c/c1c1c1c1/8/8/8/8/1C1C1C1C/C1C1C1C1 w"; got != want {
		t.Fatalf("FEN = %q, want %q", got, want)
	}
	legal := g.Legal()
	total := 0
	for _, tos := range legal {
		total += len(tos)
	}
	if len(legal) != 4 || total != 7 {
		t.Fatalf("start: %d pieces can move with %d moves, want 4 and 7: %v", len(legal), total, legal)
	}
	if got := sortedLegal(g, "b2"); got != "a3 c3" {
		t.Errorf("b2 moves = %q", got)
	}
	if g.Forced() {
		t.Error("capture is forced at the start")
	}
}

func TestCheckersRejectsBadPositions(t *testing.T) {
	for _, fen := range []string{
		"8/8/8/8/8/8/8/1C6 w", // หมากบนช่องสีอ่อน
		"8/8/8/8/8/8/8/K7 w",  // ตัวหมากของเกมอื่น
		"8/8/8/8/8/8/8 w",
		"8/8/8/8/8/8/8/C7 x",
	} {
		if _, err := NewCheckersFromFEN(fen); err == nil {
			t.Errorf("accepted %q", fen)
		}
	}
}

func TestCheckersCaptureIsForced(t *testing.T) {
	g := mustCheckers(t, "8/8/8/8/3c4/2C5/8/C7 w")
	if !g.Forced() {
		t.Fatal("Forced() = false with a capture available")
	}
	if legal := g.Legal(); len(legal) != 1 || sortedLegal(g, "c3") != "e5" {
		t.Fatalf("legal = %v, want only c3 capturing to e5", legal)
	}
	// หมากตัวอื่นเดินไม่ได้เมื่อมีการกิน
	if err := g.Move(Move{From: "a1", To: "b2"}); !errors.Is(err, ErrIllegalMove) {
		t.Fatalf("quiet move while a capture exists: %v", err)
	}
}

func TestCheckersManCapturesForwardOnly(t *testing.T) {
	g := mustCheckers(t, "8/8/8/4C3/3c4/8/8/8 w")
	if g.Forced() || sortedLegal(g, "e5") != "d6 f6" {
		t.Fatalf("a man must not capture backwards: forced=%v legal=%v", g.Forced(), g.Legal())
	}
}

func TestCheckersMultiJumpKeepsTheTurn(t *testing.T) {
	g := mustCheckers(t, "8/c7/5c2/8/3c4/2C5/8/8 w")
	playM(t, g, "c3e5")
	if g.Turn() != White || g.Ply() != 1 {
		t.Fatalf("after the first jump: turn=%s ply=%d, want white to continue", g.Turn(), g.Ply())
	}
	if legal := g.Legal(); len(legal) != 1 || sortedLegal(g, "e5") != "g7" || !g.Forced() {
		t.Fatalf("legal during the chain = %v", legal)
	}
	if !strings.HasPrefix(g.FEN(), "8/c7/5c2/4C3/8/8/8/8") {
		t.Fatalf("the jumped man is still on the board: %s", g.FEN())
	}
	playM(t, g, "e5g7")
	if g.Turn() != Black || g.Over() || g.FEN() != "8/c5C1/8/8/8/8/8/8 b" {
		t.Fatalf("after the chain: turn=%s over=%v fen=%s", g.Turn(), g.Over(), g.FEN())
	}
}

func TestCheckersPromotionEndsTheMove(t *testing.T) {
	// เบี้ยกินแล้วถึงแถวสุดท้าย กลายเป็นฮอส และหยุดแม้ว่าฮอสจะกินต่อได้
	g := mustCheckers(t, "8/6c1/5C2/4c3/8/8/8/8 w")
	playM(t, g, "f6h8")
	if g.Turn() != Black || g.FEN() != "7H/8/8/4c3/8/8/8/8 b" {
		t.Fatalf("after promoting by capture: turn=%s fen=%s", g.Turn(), g.FEN())
	}
	// ดำเดิน แล้วฮอสขาวกินได้ในตาถัดไป โดยลงช่องที่อยู่ถัดจากหมากที่ถูกกินทันที
	playM(t, g, "e5d4")
	if sortedLegal(g, "h8") != "c3" {
		t.Fatalf("king captures = %v, want only c3", g.Legal())
	}
}

func TestCheckersKingMoves(t *testing.T) {
	// ฮอสบินได้ และเมื่อกินต้องลงช่องที่อยู่ถัดจากหมากที่ถูกกินทันที
	g := mustCheckers(t, "8/c7/8/8/3c4/8/8/H7 w")
	if got := sortedLegal(g, "a1"); got != "e5" || !g.Forced() {
		t.Fatalf("king capture = %q forced=%v, want only e5", got, g.Forced())
	}
	// หมากสองตัวติดกันกินไม่ได้ ฮอสเดินได้ถึงช่องก่อนหมากตัวแรก
	g = mustCheckers(t, "8/8/8/4c3/3c4/8/8/H7 w")
	if got := sortedLegal(g, "a1"); got != "b2 c3" || g.Forced() {
		t.Fatalf("king moves = %q forced=%v, want b2 c3", got, g.Forced())
	}
	// ฮอสเดินถอยหลังได้
	g = mustCheckers(t, "7c/8/8/8/3H4/8/8/8 w")
	if got := sortedLegal(g, "d4"); got != "a1 a7 b2 b6 c3 c5 e3 e5 f2 f6 g1 g7" {
		t.Fatalf("king moves = %q", got)
	}
}

func TestCheckersWinByCapturingEverything(t *testing.T) {
	g := mustCheckers(t, "8/8/8/8/3c4/2C5/8/8 w")
	playM(t, g, "c3e5")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonWipeout {
		t.Fatalf("result = %q %q, want 1-0 wipeout", result, reason)
	}
	if err := g.Move(Move{From: "e5", To: "f6"}); !errors.Is(err, ErrGameOver) {
		t.Errorf("move after the game: %v", err)
	}
}

func TestCheckersWinByBlocking(t *testing.T) {
	// เบี้ยดำที่ a1 อยู่แถวสุดท้ายของตัวเองแล้ว เดินต่อไม่ได้
	g := mustCheckers(t, "8/6C1/8/8/8/8/8/c7 w")
	playM(t, g, "g7h8")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonBlocked {
		t.Fatalf("result = %q %q, want 1-0 blocked", result, reason)
	}
	if !strings.HasPrefix(g.FEN(), "7H/") {
		t.Errorf("the man did not become a king: %s", g.FEN())
	}
}

func TestCheckersDraws(t *testing.T) {
	g := mustCheckers(t, "7h/8/8/8/8/8/8/H7 w")
	g.quiet = quietLimit - 1
	playM(t, g, "a1b2")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw after %d quiet plies", result, reason, quietLimit)
	}

	g = mustCheckers(t, "8/8/8/8/8/8/7h/H7 w")
	playM(t, g, "a1b2", "h2g1", "b2a1", "g1h2", "a1b2", "h2g1", "b2a1")
	if g.Over() {
		t.Fatal("game over before the third repetition")
	}
	playM(t, g, "g1h2")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw by repetition", result, reason)
	}
}

func TestCheckersReplayAndRecord(t *testing.T) {
	g := NewCheckers()
	playM(t, g, "b2c3", "c7d6")
	again, err := ReplayVariant(VariantCheckers, g.Moves())
	if err != nil {
		t.Fatal(err)
	}
	if again.FEN() != g.FEN() || again.Variant() != VariantCheckers {
		t.Fatalf("replayed game differs: %s", again.FEN())
	}
	g.Forfeit(Black, ReasonTimeout)
	if result, reason := g.Result(); result != "1-0" || reason != ReasonTimeout {
		t.Fatalf("result = %q %q", result, reason)
	}
	if !strings.Contains(g.PGN(), "b2c3 c7d6 1-0") {
		t.Errorf("PGN = %q", g.PGN())
	}
	if _, err := ReplayVariant(VariantCheckers, []Move{{From: "b2", To: "b3"}}); err == nil {
		t.Error("replay accepted an illegal move")
	}
}
