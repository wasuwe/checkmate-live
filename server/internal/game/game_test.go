package game

import (
	"errors"
	"strings"
	"testing"
)

// play เดินตามลำดับในรูป "e2e4" หรือ "e7e8q" และ fail ทันทีถ้าตาไหนถูกปฏิเสธ
func play(t *testing.T, g *Game, moves ...string) {
	t.Helper()
	for _, s := range moves {
		m := Move{From: s[0:2], To: s[2:4]}
		if len(s) == 5 {
			m.Promo = s[4:5]
		}
		if err := g.Move(m); err != nil {
			t.Fatalf("move %s: %v (fen %s)", s, err, g.FEN())
		}
	}
}

func fromFEN(t *testing.T, fen string) *Game {
	t.Helper()
	g, err := NewFromFEN(fen)
	if err != nil {
		t.Fatalf("fen %q: %v", fen, err)
	}
	return g
}

func TestNewGame(t *testing.T) {
	g := New()
	if g.Turn() != White || g.Ply() != 0 || g.Over() || g.LastMove() != nil {
		t.Fatalf("unexpected initial state: turn=%s ply=%d over=%v", g.Turn(), g.Ply(), g.Over())
	}
	if res, reason := g.Result(); res != "" || reason != "" {
		t.Fatalf("result = %q/%q, want empty", res, reason)
	}
}

func TestMoveAdvancesState(t *testing.T) {
	g := New()
	play(t, g, "e2e4")
	if g.Turn() != Black || g.Ply() != 1 {
		t.Fatalf("turn=%s ply=%d, want b/1", g.Turn(), g.Ply())
	}
	if lm := g.LastMove(); lm == nil || lm.From != "e2" || lm.To != "e4" {
		t.Fatalf("last move = %+v", lm)
	}
	if !strings.HasPrefix(g.FEN(), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b") {
		t.Fatalf("fen = %s", g.FEN())
	}
}

func TestIllegalMoves(t *testing.T) {
	tests := []struct {
		name string
		m    Move
	}{
		{"pawn three squares", Move{From: "e2", To: "e5"}},
		{"opponent piece", Move{From: "e7", To: "e5"}},
		{"empty square", Move{From: "e4", To: "e5"}},
		{"blocked bishop", Move{From: "c1", To: "h6"}},
		{"bad promo code", Move{From: "e2", To: "e4", Promo: "k"}},
		{"promo on normal move", Move{From: "e2", To: "e4", Promo: "q"}},
		{"garbage squares", Move{From: "z9", To: "??"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			g := New()
			if err := g.Move(tc.m); !errors.Is(err, ErrIllegalMove) {
				t.Fatalf("err = %v, want ErrIllegalMove", err)
			}
			if g.Ply() != 0 || g.Turn() != White {
				t.Fatalf("state changed after illegal move")
			}
		})
	}
}

func TestCheckmate(t *testing.T) {
	g := New()
	play(t, g, "f2f3", "e7e5", "g2g4", "d8h4") // fool's mate
	if !g.Over() {
		t.Fatal("game should be over")
	}
	if res, reason := g.Result(); res != "0-1" || reason != ReasonCheckmate {
		t.Fatalf("result = %s/%s, want 0-1/checkmate", res, reason)
	}
	if err := g.Move(Move{From: "a2", To: "a3"}); !errors.Is(err, ErrGameOver) {
		t.Fatalf("err = %v, want ErrGameOver", err)
	}
}

func TestCastling(t *testing.T) {
	g := fromFEN(t, "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1")
	play(t, g, "e1g1", "e8c8")
	if !strings.HasPrefix(g.FEN(), "2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 w - -") {
		t.Fatalf("fen after castling = %s", g.FEN())
	}
}

func TestCastlingThroughCheckRejected(t *testing.T) {
	// เรือดำที่ f8 คุมช่อง f1 ขาวจึงลงป้อมฝั่งคิงไม่ได้
	g := fromFEN(t, "4kr2/8/8/8/8/8/8/4K2R w K - 0 1")
	if err := g.Move(Move{From: "e1", To: "g1"}); !errors.Is(err, ErrIllegalMove) {
		t.Fatalf("err = %v, want ErrIllegalMove", err)
	}
}

func TestEnPassant(t *testing.T) {
	g := New()
	play(t, g, "e2e4", "a7a6", "e4e5", "d7d5", "e5d6")
	if !strings.HasPrefix(g.FEN(), "rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR b") {
		t.Fatalf("fen after en passant = %s", g.FEN())
	}
}

func TestPromotion(t *testing.T) {
	const fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1"

	g := fromFEN(t, fen)
	if err := g.Move(Move{From: "a7", To: "a8"}); !errors.Is(err, ErrIllegalMove) {
		t.Fatalf("promotion without piece: err = %v, want ErrIllegalMove", err)
	}

	for promo, piece := range map[string]string{"q": "Q", "r": "R", "b": "B", "n": "N"} {
		g := fromFEN(t, fen)
		play(t, g, "a7a8"+promo)
		if !strings.HasPrefix(g.FEN(), piece+"7/7k/") {
			t.Errorf("promo %s: fen = %s", promo, g.FEN())
		}
	}
}

func TestStalemate(t *testing.T) {
	g := fromFEN(t, "7k/5Q2/8/8/8/8/8/K7 w - - 0 1")
	play(t, g, "f7g6") // ดำไม่ถูกรุกแต่ไม่มีตาเดิน
	if res, reason := g.Result(); res != "1/2-1/2" || reason != ReasonStalemate {
		t.Fatalf("result = %s/%s, want 1/2-1/2/stalemate", res, reason)
	}
}

func TestInsufficientMaterial(t *testing.T) {
	g := fromFEN(t, "7k/8/8/8/8/8/1p6/K7 w - - 0 1")
	play(t, g, "a1b2") // เหลือคิงกับคิง
	if res, reason := g.Result(); res != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %s/%s, want 1/2-1/2/draw", res, reason)
	}
}

func TestThreefoldRepetitionAutoDraw(t *testing.T) {
	g := New()
	play(t, g, "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1")
	if g.Over() {
		t.Fatal("game ended before the third repetition")
	}
	play(t, g, "f6g8") // ตำแหน่งเริ่มต้นเกิดครั้งที่ 3
	if res, reason := g.Result(); res != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %s/%s, want 1/2-1/2/draw", res, reason)
	}
}

func TestFiftyMoveRuleAutoDraw(t *testing.T) {
	g := fromFEN(t, "7k/8/8/8/8/8/8/KR6 w - - 99 80")
	play(t, g, "b1b2")
	if res, reason := g.Result(); res != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %s/%s, want 1/2-1/2/draw", res, reason)
	}
}

func TestResign(t *testing.T) {
	g := New()
	play(t, g, "e2e4")
	g.Resign(White)
	if res, reason := g.Result(); res != "0-1" || reason != ReasonResign {
		t.Fatalf("result = %s/%s, want 0-1/resign", res, reason)
	}
	g.Resign(Black) // หลังเกมจบต้องไม่มีผล
	if res, _ := g.Result(); res != "0-1" {
		t.Fatalf("result changed after second resign: %s", res)
	}
}

func TestForfeitKeepsReason(t *testing.T) {
	g := New()
	g.Forfeit(Black, ReasonAbandon)
	if res, reason := g.Result(); res != "1-0" || reason != ReasonAbandon {
		t.Fatalf("result = %s/%s, want 1-0/abandon", res, reason)
	}
}

func TestPGNContainsMoves(t *testing.T) {
	g := New()
	play(t, g, "e2e4", "e7e5")
	if pgn := g.PGN(); !strings.Contains(pgn, "e4") || !strings.Contains(pgn, "e5") {
		t.Fatalf("pgn = %q", pgn)
	}
}
