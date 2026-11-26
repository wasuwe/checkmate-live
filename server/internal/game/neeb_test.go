package game

import (
	"errors"
	"strings"
	"testing"
)

func mustNeeb(t *testing.T, fen string) *Neeb {
	t.Helper()
	g, err := NewNeebFromFEN(fen)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestNeebStart(t *testing.T) {
	g := NewNeeb()
	if got, want := g.FEN(), "oooooooo/8/8/8/8/8/8/OOOOOOOO w"; got != want {
		t.Fatalf("FEN = %q, want %q", got, want)
	}
	legal := g.Legal()
	if len(legal) != 8 {
		t.Fatalf("%d pieces can move at the start, want 8", len(legal))
	}
	// เดินขึ้นได้ 6 ช่อง (แถว 2–7) ช่องข้าง ๆ มีหมากของเราขวาง
	if got := sortedLegal(g, "d1"); got != "d2 d3 d4 d5 d6 d7" {
		t.Fatalf("d1 moves = %q", got)
	}
}

func TestNeebMovesLikeARook(t *testing.T) {
	g := mustNeeb(t, "7o/8/8/3o4/8/1O1O4/8/8 w")
	// d3: ขึ้นได้ถึง d4 (d5 มีหมาก), ลง d2 d1, ซ้าย c3 (b3 มีหมากของเรา), ขวา e3–h3
	if got := sortedLegal(g, "d3"); got != "c3 d1 d2 d4 e3 f3 g3 h3" {
		t.Fatalf("d3 moves = %q", got)
	}
	for _, m := range []Move{
		{From: "d3", To: "e4"},             // ทแยง
		{From: "d3", To: "d6"},             // ข้ามหมาก
		{From: "d3", To: "b3"},             // ทับหมากของเรา
		{From: "d3", To: "d5"},             // ทับหมากฝ่ายตรงข้าม (หมากหนีบไม่กินด้วยการทับ)
		{From: "d5", To: "d4"},             // ไม่ใช่ตาของดำ
		{From: "d3", To: "d4", Promo: "q"}, // ไม่มีการเลื่อนขั้น
	} {
		if err := g.Move(m); !errors.Is(err, ErrIllegalMove) {
			t.Errorf("move %+v: err = %v, want ErrIllegalMove", m, err)
		}
	}
}

func TestNeebCaptures(t *testing.T) {
	tests := []struct {
		name string
		fen  string
		move string
		want string
	}{
		{"moving next to a piece without closing the line takes nothing", "7o/8/8/8/8/8/3O4/Oo6 w", "d2c2", "7o/8/8/8/8/8/2O5/Oo6 b"},
		{"custodian along a row", "7o/8/8/8/8/8/2O5/Oo6 w", "c2c1", "7o/8/8/8/8/8/8/O1O5 b"},
		{"custodian along a column", "7o/8/8/8/8/O7/o7/1O6 w", "b1a1", "7o/8/8/8/8/O7/8/O7 b"},
		{"custodian takes a whole line of pieces", "7o/8/8/8/8/8/4O3/Oooo4 w", "e2e1", "7o/8/8/8/8/8/8/O3O3 b"},
		{"a gap in the line means no capture", "7o/8/8/8/8/8/4O3/Oo1o4 w", "e2e1", "7o/8/8/8/8/8/8/Oo1oO3 b"},
		{"the edge of the board does not capture", "7o/8/8/8/8/8/1O6/o7 w", "b2b1", "7o/8/8/8/8/8/8/oO6 b"},
		{"intervention: moving between two pieces takes both", "7o/8/8/8/8/8/1O6/o1o5 w", "b2b1", "7o/8/8/8/8/8/8/1O6 b"},
		{"intervention along a column", "7o/8/8/o7/1O6/o7/8/8 w", "b4a4", "7o/8/8/8/O7/8/8/8 b"},
		{"both kinds at once", "7o/8/3O4/3o4/2o1o3/8/8/3O4 w", "d1d4", "7o/8/3O4/8/3O4/8/8/8 b"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := mustNeeb(t, tt.fen)
			playM(t, g, tt.move)
			if g.FEN() != tt.want {
				t.Errorf("after %s: %s, want %s", tt.move, g.FEN(), tt.want)
			}
		})
	}
}

func TestNeebMovingIntoASandwichIsSafe(t *testing.T) {
	// ดำเดินเข้าไปอยู่ระหว่างหมากขาวสองตัวเอง: ไม่ถูกกิน และสอดกินขาวทั้งสองตัว
	g := mustNeeb(t, "8/8/8/8/8/1o6/8/O1O4O b")
	playM(t, g, "b3b1")
	if g.FEN() != "8/8/8/8/8/8/8/1o5O w" {
		t.Fatalf("after b3b1: %s", g.FEN())
	}
	// หมากที่ถูกประกบอยู่แล้วโดยไม่มีใครเดินมาหนีบ ไม่ถูกกินย้อนหลัง
	g = mustNeeb(t, "8/8/8/8/8/8/7o/OoO4O w")
	playM(t, g, "h1g1")
	if g.FEN() != "8/8/8/8/8/8/7o/OoO3O1 b" {
		t.Fatalf("a piece was captured without a capturing move: %s", g.FEN())
	}
}

func TestNeebWins(t *testing.T) {
	// ดำเหลือ 3 ตัว ขาวหนีบ b1 ได้ ดำจึงเหลือ 2 ตัวและแพ้ทันที
	g := mustNeeb(t, "6oo/8/8/8/8/8/2O5/Oo5O w")
	playM(t, g, "c2c1")
	if g.FEN() != "6oo/8/8/8/8/8/8/O1O4O b" {
		t.Fatalf("after the capture: %s", g.FEN())
	}
	if result, reason := g.Result(); result != "1-0" || reason != ReasonWipeout {
		t.Fatalf("result = %q %q, want 1-0 because black is down to two pieces", result, reason)
	}
	if err := g.Move(Move{From: "h8", To: "h7"}); !errors.Is(err, ErrGameOver) {
		t.Errorf("move after the game: %v", err)
	}

	// เหลือ 3 ตัวยังเล่นต่อ
	g = mustNeeb(t, "5ooo/8/8/8/8/8/2O5/Oo5O w")
	playM(t, g, "c2c1")
	if g.Over() {
		t.Fatalf("game over with three pieces left: %s", g.FEN())
	}

	// สอดกิน 2 ตัวพร้อมกันจาก 4 ตัว เหลือ 2 ตัว แพ้
	g = mustNeeb(t, "6oo/8/8/8/8/8/1O6/o1o3OO w")
	playM(t, g, "b2b1")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonWipeout {
		t.Fatalf("result = %q %q, want 1-0 after an intervention capture", result, reason)
	}

	// ดำที่มุม a8 กับ a7 b8 ถูกปิดทุกทาง แม้ยังมีหมาก 3 ตัว
	g = mustNeeb(t, "oo6/oO6/O7/8/8/8/8/2O5 w")
	playM(t, g, "c1c8")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonBlocked {
		t.Fatalf("result = %q %q, want 1-0 blocked (%s)", result, reason, g.FEN())
	}
}

func TestNeebDraws(t *testing.T) {
	g := mustNeeb(t, "5ooo/8/8/8/8/8/8/OOO5 w")
	g.quiet = neebQuietLimit - 1
	playM(t, g, "a1a2")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw after %d quiet plies", result, reason, neebQuietLimit)
	}

	g = mustNeeb(t, "5ooo/8/8/8/8/8/8/OOO5 w")
	playM(t, g, "a1a2", "h8h7", "a2a1", "h7h8", "a1a2", "h8h7", "a2a1")
	if g.Over() {
		t.Fatal("game over before the third repetition")
	}
	playM(t, g, "h7h8")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw by repetition", result, reason)
	}
}

func TestNeebReplayAndRecord(t *testing.T) {
	g := NewNeeb()
	playM(t, g, "d1d4", "e8e5")
	again, err := ReplayVariant(VariantNeeb, g.Moves())
	if err != nil {
		t.Fatal(err)
	}
	if again.FEN() != g.FEN() || again.Variant() != VariantNeeb || again.Forced() {
		t.Fatalf("replayed game differs: %s", again.FEN())
	}
	g.Resign(Black)
	if result, reason := g.Result(); result != "1-0" || reason != ReasonResign {
		t.Fatalf("result = %q %q", result, reason)
	}
	if !strings.Contains(g.PGN(), "1. d1d4 e8e5 1-0") {
		t.Errorf("PGN = %q", g.PGN())
	}
	if _, err := ReplayVariant(VariantNeeb, []Move{{From: "d1", To: "e2"}}); err == nil {
		t.Error("replay accepted an illegal move")
	}
	if _, err := NewNeebFromFEN("8/8/8/8/8/8/8/K7 w"); err == nil {
		t.Error("accepted a piece from another game")
	}
}
