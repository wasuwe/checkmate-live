package game

import (
	"encoding/json"
	"flag"
	"math/rand/v2"
	"os"
	"slices"
	"strings"
	"testing"
)

// เล่นสุ่มหลายเกมต่อชนิด แล้วตรวจสิ่งที่ต้องเป็นจริงเสมอไม่ว่าจะเดินอย่างไร
// ใช้ seed คงที่ ผลจึงเหมือนเดิมทุกครั้งที่รัน

const playoutGames = 400
const playoutMaxPly = 3000

type legalMove struct{ from, to string }

func allLegal(g Engine) []legalMove {
	var out []legalMove
	for from, tos := range g.Legal() {
		for _, to := range tos {
			out = append(out, legalMove{from, to})
		}
	}
	// map ของ Go วนไม่เรียงลำดับ ต้องเรียงก่อนเพื่อให้การสุ่มซ้ำได้
	slices.SortFunc(out, func(a, b legalMove) int {
		return strings.Compare(a.from+a.to, b.from+b.to)
	})
	return out
}

func sidePieces(fen string) (white, black int) {
	for _, ch := range strings.Fields(fen)[0] {
		switch {
		case ch >= 'A' && ch <= 'Z':
			white++
		case ch >= 'a' && ch <= 'z':
			black++
		}
	}
	return
}

// playout เล่นสุ่มหนึ่งเกม เรียก check หลังทุกตาเดิน คืนเหตุผลที่จบ ("" ถ้าถูกตัดที่ playoutMaxPly)
func playout(t *testing.T, g Engine, rng *rand.Rand, check func(before, after string, m legalMove, moverKept bool)) string {
	t.Helper()
	squares := make([]string, 64)
	for i := range squares {
		squares[i] = squareName(i)
	}
	for ply := 0; ply < playoutMaxPly && !g.Over(); ply++ {
		moves := allLegal(g)
		if len(moves) == 0 {
			t.Fatalf("game is not over but the side to move has no legal move: %s", g.FEN())
		}
		before, mover := g.FEN(), g.Turn()

		// ตาเดินสุ่มที่ไม่อยู่ในรายการต้องถูกปฏิเสธ และกระดานต้องไม่เปลี่ยน
		bad := legalMove{squares[rng.IntN(64)], squares[rng.IntN(64)]}
		if !slices.Contains(moves, bad) {
			if err := g.Move(Move{From: bad.from, To: bad.to}); err == nil {
				t.Fatalf("accepted %s%s which is not in the legal list, position %s", bad.from, bad.to, before)
			}
			if g.FEN() != before || g.Ply() != ply {
				t.Fatalf("a rejected move changed the game: %s -> %s", before, g.FEN())
			}
		}

		m := moves[rng.IntN(len(moves))]
		if err := g.Move(Move{From: m.from, To: m.to}); err != nil {
			t.Fatalf("legal move %s%s was rejected in %s: %v", m.from, m.to, before, err)
		}
		if g.Ply() != ply+1 {
			t.Fatalf("ply = %d after %d moves", g.Ply(), ply+1)
		}
		if lm := g.LastMove(); lm == nil || lm.From != m.from || lm.To != m.to {
			t.Fatalf("LastMove = %+v after %s%s", lm, m.from, m.to)
		}
		wb, bb := sidePieces(before)
		wa, ba := sidePieces(g.FEN())
		if wa > wb || ba > bb {
			t.Fatalf("pieces appeared: %s -> %s", before, g.FEN())
		}
		// ฝ่ายที่เดินไม่เสียหมากของตัวเองจากการเดินของตัวเอง
		if (mover == White && wa != wb) || (mover == Black && ba != bb) {
			t.Fatalf("%s lost its own piece by moving %s%s: %s -> %s", mover, m.from, m.to, before, g.FEN())
		}
		check(before, g.FEN(), m, g.Turn() == mover)
	}
	result, reason := g.Result()
	if g.Over() != (result != "") || (result == "") != (reason == "") {
		t.Fatalf("inconsistent result: over=%v result=%q reason=%q", g.Over(), result, reason)
	}
	if g.Over() && g.Legal() != nil {
		t.Fatalf("a finished game still lists legal moves")
	}
	return reason
}

func TestMakrukRandomPlayouts(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	reasons := map[string]int{}
	for range playoutGames {
		g := NewMakruk()
		reason := playout(t, g, rng, func(before, after string, m legalMove, moverKept bool) {
			if moverKept {
				t.Fatalf("the turn did not pass after %s%s", m.from, m.to)
			}
			board := strings.Fields(after)[0]
			if strings.Count(board, "K") != 1 || strings.Count(board, "k") != 1 {
				t.Fatalf("a khun is missing: %s", after)
			}
			// ฝ่ายที่เพิ่งเดินต้องไม่ทิ้งขุนของตัวเองให้ถูกรุก
			if g.inCheck(g.turn.Other()) {
				t.Fatalf("%s%s left the mover's own khun in check: %s", m.from, m.to, after)
			}
			// เบี้ยคว่ำอยู่เลยแถวหงายไม่ได้
			for i, p := range g.board {
				if (p == 'P' && i/8 >= 5) || (p == 'p' && i/8 <= 2) {
					t.Fatalf("an unpromoted bia is past its promotion rank: %s", after)
				}
			}
			// การนับศักดิ์มีได้เฉพาะเมื่อไม่มีเบี้ยคว่ำ และเลขที่นับไม่เกินจำนวนที่กำหนด
			if c := g.Count(); c != nil {
				if strings.ContainsAny(board, "Pp") {
					t.Fatalf("counting with an unpromoted bia on the board: %s %+v", after, c)
				}
				if c.Kind == countBoard && c.N > c.Limit {
					t.Fatalf("board count ran past its limit: %+v", c)
				}
			}
		})
		reasons[reason]++
		if reason == "" {
			t.Fatalf("a makruk game did not end within %d plies: %s", playoutMaxPly, g.FEN())
		}
		// เกมที่บันทึกไว้ต้องเล่นซ้ำได้ตำแหน่งและผลเดิม (ใช้กู้ห้องหลังเซิร์ฟเวอร์รีสตาร์ต)
		again, err := ReplayVariant(VariantMakruk, g.Moves())
		if err != nil || again.FEN() != g.FEN() {
			t.Fatalf("replay differs: %v", err)
		}
		r1, why1 := again.Result()
		r2, why2 := g.Result()
		if r1 != r2 || why1 != why2 {
			t.Fatalf("replayed result %q %q, played result %q %q", r1, why1, r2, why2)
		}
	}
	t.Logf("makruk endings: %v", reasons)
	for _, want := range []string{ReasonCheckmate, ReasonCount} {
		if reasons[want] == 0 {
			t.Errorf("no random game ended by %s; the test no longer covers that ending", want)
		}
	}
}

func TestCheckersRandomPlayouts(t *testing.T) {
	rng := rand.New(rand.NewPCG(3, 4))
	reasons := map[string]int{}
	chains := 0
	for range playoutGames {
		g := NewCheckers()
		reason := playout(t, g, rng, func(before, after string, m legalMove, moverKept bool) {
			for i, p := range g.board {
				if p != 0 && (i/8+i%8)%2 != 0 {
					t.Fatalf("a piece is on a light square: %s", after)
				}
				if (p == 'C' && i/8 == 7) || (p == 'c' && i/8 == 0) {
					t.Fatalf("a man sits on its last row without being crowned: %s", after)
				}
			}
			wb, bb := sidePieces(before)
			wa, ba := sidePieces(after)
			captured := wa+ba < wb+bb
			if wb+bb-wa-ba > 1 {
				t.Fatalf("one hop captured more than one piece: %s -> %s", before, after)
			}
			if moverKept {
				chains++
				// ตาอยู่กับฝ่ายเดิมได้เฉพาะหลังกิน และต้องเดินต่อด้วยหมากตัวเดิมโดยการกินเท่านั้น
				legal := g.Legal()
				if !captured || len(legal) != 1 || len(legal[m.to]) == 0 || !g.Forced() {
					t.Fatalf("bad chain state after %s%s: captured=%v legal=%v", m.from, m.to, captured, legal)
				}
			}
			// ถ้าบังคับกิน ทุกตาเดินในรายการต้องเป็นการกิน (เดินไกลกว่า 1 ช่องทแยงและข้ามหมากฝ่ายตรงข้าม)
			if !g.Over() && g.Forced() {
				for _, mv := range allLegal(g) {
					from, _ := squareIndex(mv.from)
					if !slices.ContainsFunc(g.captures(from), func(h hop) bool { return squareName(h.to) == mv.to }) {
						t.Fatalf("forced position lists a quiet move %s%s: %s", mv.from, mv.to, after)
					}
				}
			}
		})
		reasons[reason]++
		if reason == "" {
			t.Fatalf("a checkers game did not end within %d plies: %s", playoutMaxPly, g.FEN())
		}
		again, err := ReplayVariant(VariantCheckers, g.Moves())
		if err != nil || again.FEN() != g.FEN() {
			t.Fatalf("replay differs: %v", err)
		}
	}
	t.Logf("checkers endings: %v, multi-jump hops: %d", reasons, chains)
	if chains == 0 {
		t.Error("no random game had a multi-jump; the test no longer covers chains")
	}
	if reasons[ReasonWipeout]+reasons[ReasonBlocked] == 0 {
		t.Error("no random game was won on the board")
	}
}

func TestNeebRandomPlayouts(t *testing.T) {
	rng := rand.New(rand.NewPCG(5, 6))
	reasons := map[string]int{}
	captures := 0
	for range playoutGames {
		g := NewNeeb()
		reason := playout(t, g, rng, func(before, after string, m legalMove, moverKept bool) {
			if moverKept {
				t.Fatalf("the turn did not pass after %s%s", m.from, m.to)
			}
			wb, bb := sidePieces(before)
			wa, ba := sidePieces(after)
			if wa+ba < wb+bb {
				captures++
			}
			// หมากเดินแนวตรงเท่านั้น
			if m.from[0] != m.to[0] && m.from[1] != m.to[1] {
				t.Fatalf("a diagonal move was legal: %s%s", m.from, m.to)
			}
		})
		reasons[reason]++
		again, err := ReplayVariant(VariantNeeb, g.Moves())
		if err != nil || again.FEN() != g.FEN() {
			t.Fatalf("replay differs: %v", err)
		}
	}
	t.Logf("neeb endings (\"\" = cut at %d plies): %v, captures: %d", playoutMaxPly, reasons, captures)
	if captures == 0 {
		t.Error("no random game had a capture")
	}
}

// ---------- ตำแหน่งตัวอย่างที่ใช้ร่วมกับหน้าเว็บ ----------
// หน้าเว็บมีโค้ดแสดงผลล่วงหน้าของแต่ละเกม (web/src/lib/{makruk,checkers,neeb}.ts) ซึ่งต้องให้กระดาน
// หลังเดินตรงกับเซิร์ฟเวอร์ ไฟล์ fixture นี้สร้างจากเซิร์ฟเวอร์และถูกตรวจจากทั้งสองฝั่ง
// สร้างใหม่ด้วย: go test ./internal/game -run TestPreviewFixtures -update

var updateFixtures = flag.Bool("update", false, "rewrite the fixtures shared with the web tests")

const fixturePath = "../../../web/src/lib/fixtures/preview.json"

type previewCase struct {
	Game   string `json:"game"`
	FEN    string `json:"fen"`
	From   string `json:"from"`
	To     string `json:"to"`
	Board  string `json:"board"` // กระดานหลังเดิน (ไม่รวมฝ่ายที่ถึงตา)
	Legal  int    `json:"legal"` // จำนวนตาเดินที่ถูกกติกาก่อนเดิน
	Forced bool   `json:"forced,omitempty"`
}

func buildPreviewCases() []previewCase {
	var out []previewCase
	for i, v := range []Variant{VariantMakruk, VariantCheckers, VariantNeeb} {
		rng := rand.New(rand.NewPCG(uint64(10+i), 99))
		for range 3 {
			g := NewVariant(v)
			for ply := 0; ply < 120 && !g.Over(); ply++ {
				moves := allLegal(g)
				m := moves[rng.IntN(len(moves))]
				c := previewCase{Game: string(v), FEN: g.FEN(), From: m.from, To: m.to, Legal: len(moves), Forced: g.Forced()}
				if err := g.Move(Move{From: m.from, To: m.to}); err != nil {
					panic(err)
				}
				c.Board = strings.Fields(g.FEN())[0]
				out = append(out, c)
			}
		}
	}
	return out
}

func TestPreviewFixtures(t *testing.T) {
	cases := buildPreviewCases()
	// หนึ่งตำแหน่งต่อบรรทัด ให้ไฟล์เล็กและ diff อ่านได้
	lines := make([]string, len(cases))
	for i, c := range cases {
		b, err := json.Marshal(c)
		if err != nil {
			t.Fatal(err)
		}
		lines[i] = string(b)
	}
	want := []byte("[\n" + strings.Join(lines, ",\n") + "\n]\n")
	if *updateFixtures {
		if err := os.MkdirAll("../../../web/src/lib/fixtures", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fixturePath, want, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixtures (run with -update to create them): %v", err)
	}
	if strings.ReplaceAll(string(got), "\r\n", "\n") != string(want) {
		t.Fatal("web/src/lib/fixtures/preview.json is out of date with the game rules; run: go test ./internal/game -run TestPreviewFixtures -update")
	}
}
