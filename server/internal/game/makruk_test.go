package game

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

func mustMakruk(t *testing.T, fen string) *Makruk {
	t.Helper()
	g, err := NewMakrukFromFEN(fen)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func playM(t *testing.T, g Engine, moves ...string) {
	t.Helper()
	for _, m := range moves {
		if err := g.Move(Move{From: m[0:2], To: m[2:4]}); err != nil {
			t.Fatalf("move %s: %v (position %s)", m, err, g.FEN())
		}
	}
}

// perft นับจำนวนตำแหน่งปลายทางที่ความลึก depth เทียบกับค่ามาตรฐานของหมากรุกไทย
func perft(g *Makruk, depth int) int {
	if depth == 0 {
		return 1
	}
	total := 0
	for from := range g.board {
		for _, to := range g.legalFrom(from) {
			saved, turn := g.board, g.turn
			g.apply(from, to)
			g.turn = turn.Other()
			total += perft(g, depth-1)
			g.board, g.turn = saved, turn
		}
	}
	return total
}

func TestMakrukPerft(t *testing.T) {
	want := []int{1, 23, 529, 12012, 273026}
	for depth, n := range want {
		if testing.Short() && depth > 3 {
			break
		}
		if got := perft(NewMakruk(), depth); got != n {
			t.Errorf("perft(%d) = %d, want %d", depth, got, n)
		}
	}
}

func TestMakrukStart(t *testing.T) {
	g := NewMakruk()
	if got, want := g.FEN(), "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w"; got != want {
		t.Fatalf("FEN = %q, want %q", got, want)
	}
	legal := g.Legal()
	if got := legal["d1"]; len(got) != 3 {
		t.Errorf("khun moves = %v, want 3", got)
	}
	if got := legal["e3"]; !slices.Equal(got, []string{"e4"}) {
		t.Errorf("bia moves = %v, want only e4 (no double step)", got)
	}
	if g.Count() != nil {
		t.Errorf("counting at the start: %+v", g.Count())
	}
}

func TestMakrukPieceMoves(t *testing.T) {
	tests := []struct {
		name string
		fen  string
		from string
		want string // ช่องปลายทางเรียงตามตัวอักษร คั่นด้วยช่องว่าง
	}{
		{"met moves one step diagonally", "4k3/8/8/8/3M4/8/8/K7 w", "d4", "c3 c5 e3 e5"},
		{"khon moves diagonally or one step forward", "4k3/8/8/8/3S4/8/8/K7 w", "d4", "c3 c5 d5 e3 e5"},
		{"black khon moves forward towards rank 1", "4k3/8/8/8/3s4/8/8/K7 b", "d4", "c3 c5 d3 e3 e5"},
		{"promoted bia moves like a met", "4k3/8/8/8/3F4/8/8/K7 w", "d4", "c3 c5 e3 e5"},
		{"bia captures diagonally, not straight", "4k3/8/8/3pp3/3P4/8/8/K7 w", "d4", "e5"},
		{"rua is blocked by pieces", "4k3/8/3p4/8/1P1R4/8/8/K7 w", "d4", "c4 d1 d2 d3 d5 d6 e4 f4 g4 h4"},
		{"ma jumps", "4k3/8/8/8/8/PPP5/8/KN6 w", "b1", "d2"},
		{"a pinned piece cannot leave the line", "4r3/8/8/8/8/8/4S3/4K2k w", "e2", "e3"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mustMakruk(t, tt.fen).Legal()[tt.from]
			slices.Sort(got)
			if strings.Join(got, " ") != tt.want {
				t.Errorf("moves from %s = %v, want %s", tt.from, got, tt.want)
			}
		})
	}
}

func TestMakrukPromotion(t *testing.T) {
	g := mustMakruk(t, "4k3/8/8/3P4/8/2p5/8/K7 w")
	playM(t, g, "d5d6")
	if !strings.HasPrefix(g.FEN(), "4k3/8/3F4/") {
		t.Fatalf("white bia did not flip on rank 6: %s", g.FEN())
	}
	playM(t, g, "c3c2")
	if strings.Contains(g.FEN(), "f") {
		t.Fatalf("black bia flipped before rank 3 from its side: %s", g.FEN())
	}
	g = mustMakruk(t, "4k3/8/8/8/2p5/8/8/K7 b")
	playM(t, g, "c4c3")
	if !strings.Contains(g.FEN(), "/2f5/") {
		t.Fatalf("black bia did not flip on rank 3: %s", g.FEN())
	}
}

func TestMakrukRejectsIllegalMoves(t *testing.T) {
	g := NewMakruk()
	for _, m := range []Move{
		{From: "e3", To: "e5"},             // เบี้ยเดิน 2 ช่องไม่ได้
		{From: "e6", To: "e5"},             // ไม่ใช่ตาของดำ
		{From: "d1", To: "b1"},             // ไม่มีการเข้าป้อม
		{From: "e3", To: "e4", Promo: "q"}, // ไม่มีการเลือกตัวเลื่อนขั้น
		{From: "z9", To: "e4"},
	} {
		if err := g.Move(m); !errors.Is(err, ErrIllegalMove) {
			t.Errorf("move %+v: err = %v, want ErrIllegalMove", m, err)
		}
	}
	if g.Ply() != 0 {
		t.Errorf("ply = %d after rejected moves", g.Ply())
	}
}

func TestMakrukCheckAndCheckmate(t *testing.T) {
	g := mustMakruk(t, "7k/8/6K1/8/8/8/8/R7 w")
	playM(t, g, "a1a8")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonCheckmate {
		t.Fatalf("result = %s %s, want 1-0 checkmate", result, reason)
	}
	if err := g.Move(Move{From: "h8", To: "h7"}); !errors.Is(err, ErrGameOver) {
		t.Errorf("move after the game: %v", err)
	}

	g = mustMakruk(t, "4k3/8/8/8/8/8/8/R3K3 w")
	playM(t, g, "a1a8")
	if got := g.Check(); got != "e8" {
		t.Errorf("Check() = %q, want e8", got)
	}
	if _, ok := g.Legal()["e8"]; !ok || g.Over() {
		t.Errorf("the checked khun must still have moves")
	}
}

func TestMakrukStalemate(t *testing.T) {
	// ขุนดำที่ h8 ไม่ถูกรุกแต่ไม่มีช่องเดิน
	g := mustMakruk(t, "7k/5K2/8/5M2/8/8/8/8 w")
	playM(t, g, "f5g6")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonStalemate {
		t.Fatalf("result = %q %q, want draw by stalemate", result, reason)
	}
}

func TestMakrukBareKingsDraw(t *testing.T) {
	g := mustMakruk(t, "4k3/8/8/8/8/8/3m4/3K4 w")
	playM(t, g, "d1d2")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw", result, reason)
	}
}

func TestMakrukRepetitionDraw(t *testing.T) {
	g := NewMakruk()
	playM(t, g, "b1d2", "b8d7", "d2b1", "d7b8", "b1d2", "b8d7", "d2b1")
	if g.Over() {
		t.Fatal("game over before the third repetition")
	}
	playM(t, g, "d7b8")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonDraw {
		t.Fatalf("result = %q %q, want a draw by repetition", result, reason)
	}
}

func TestMakrukPiecesCount(t *testing.T) {
	// เรือ 2 ลำไล่ขุนเดี่ยว: นับถึง 8 เริ่มจากจำนวนหมาก (4) + 1
	g := mustMakruk(t, "7k/8/8/8/8/8/8/RR2K3 w")
	c := g.Count()
	if c == nil || c.Kind != "pieces" || c.Limit != 8 || c.N != 4 || c.Side != Black {
		t.Fatalf("count = %+v, want pieces 4/8 counted by black", c)
	}
	// ขาวเดินเรือไปมาโดยไม่รุก ดำนับ 5, 6, 7, 8
	playM(t, g, "a1a2", "h8g8", "a2a1", "g8h8", "a1a2", "h8g8", "a2a3")
	if got := g.Count(); got == nil || got.N != 7 {
		t.Fatalf("count = %+v, want 7", got)
	}
	playM(t, g, "g8h8")
	if got := g.Count(); got == nil || got.N != 8 || g.Over() {
		t.Fatalf("count = %+v over=%v, want 8 and still playing", got, g.Over())
	}
	// ฝ่ายไล่ยังมีอีกหนึ่งตา ถ้าไม่จนคือเสมอ
	playM(t, g, "a3a4")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonCount {
		t.Fatalf("result = %q %q, want a draw by counting", result, reason)
	}
}

func TestMakrukMateOnTheLastCountWins(t *testing.T) {
	g := mustMakruk(t, "7k/8/6K1/8/8/8/8/R7 b")
	g.count.N = g.count.Limit - 1
	playM(t, g, "h8g8") // นับครบพอดี
	if g.Over() {
		t.Fatal("game over before the chasing side replied")
	}
	playM(t, g, "a1a8")
	if result, reason := g.Result(); result != "1-0" || reason != ReasonCheckmate {
		t.Fatalf("result = %q %q, want checkmate to win", result, reason)
	}
}

func TestMakrukCountLimits(t *testing.T) {
	tests := []struct {
		fen   string
		limit int
	}{
		{"7k/8/8/8/8/8/8/R3K3 w", 16},
		{"7k/8/8/8/8/8/8/SS2K3 w", 22},
		{"7k/8/8/8/8/8/8/NN2K3 w", 32},
		{"7k/8/8/8/8/8/8/S3K3 w", 44},
		{"7k/8/8/8/8/8/8/N3K3 w", 64},
		{"7k/8/8/8/8/8/8/MF2K3 w", 64},
	}
	for _, tt := range tests {
		c := mustMakruk(t, tt.fen).Count()
		if c == nil || c.Kind != "pieces" || c.Limit != tt.limit {
			t.Errorf("%s: count = %+v, want pieces limit %d", tt.fen, c, tt.limit)
		}
	}
}

func TestMakrukBoardCount(t *testing.T) {
	// ไม่มีเบี้ยคว่ำ และทั้งสองฝ่ายยังมีหมาก: นับศักดิ์กระดาน 64 ตา
	g := mustMakruk(t, "r6k/8/8/8/8/8/8/R3K3 w")
	if c := g.Count(); c == nil || c.Kind != "board" || c.Limit != 64 {
		t.Fatalf("count = %+v, want board count", c)
	}
	// มีเบี้ยคว่ำอยู่: ไม่นับ
	if c := mustMakruk(t, "r6k/8/8/8/8/P7/8/R3K3 w").Count(); c != nil {
		t.Fatalf("count = %+v with a bia on the board", c)
	}
	// เดินไปมาแบบไม่ซ้ำตำแหน่งเกิน 2 ครั้งไม่ได้ จึงตรวจการจบด้วยตัวนับโดยตรง
	g.boardPlies = boardCountLimit*2 - 2
	playM(t, g, "a1a2")
	if g.Over() {
		t.Fatal("draw one ply early")
	}
	if c := g.Count(); c.N != 64 {
		t.Fatalf("count = %+v, want 64", c)
	}
	playM(t, g, "a8a7")
	if result, reason := g.Result(); result != "1/2-1/2" || reason != ReasonCount {
		t.Fatalf("result = %q %q, want a draw by counting", result, reason)
	}
}

func TestMakrukForfeitAndReplay(t *testing.T) {
	g := NewMakruk()
	playM(t, g, "e3e4", "e6e5")
	g.Resign(White)
	if result, reason := g.Result(); result != "0-1" || reason != ReasonResign {
		t.Fatalf("result = %q %q", result, reason)
	}
	if !strings.Contains(g.PGN(), "1. e3e4 e6e5 0-1") {
		t.Errorf("PGN = %q", g.PGN())
	}

	again, err := ReplayVariant(VariantMakruk, g.Moves())
	if err != nil {
		t.Fatal(err)
	}
	if again.FEN() != g.FEN() || again.Ply() != 2 || again.Variant() != VariantMakruk {
		t.Errorf("replayed game differs: %s", again.FEN())
	}
	if _, err := ReplayVariant(VariantMakruk, []Move{{From: "e3", To: "e5"}}); err == nil {
		t.Error("replay accepted an illegal move")
	}
}

func TestParseVariant(t *testing.T) {
	for in, want := range map[string]Variant{"": VariantChess, "chess": VariantChess, "makruk": VariantMakruk} {
		if got, ok := ParseVariant(in); !ok || got != want {
			t.Errorf("ParseVariant(%q) = %q, %v", in, got, ok)
		}
	}
	if _, ok := ParseVariant("go"); ok {
		t.Error("ParseVariant accepted an unknown game")
	}
}
