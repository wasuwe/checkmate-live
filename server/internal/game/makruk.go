package game

import (
	"fmt"
	"slices"
	"strings"
)

// ReasonCount คือเสมอเพราะนับศักดิ์ครบแล้วยังไม่จน (หมากรุกไทย)
const ReasonCount = "count"

// ตัวหมากของหมากรุกไทย ตัวพิมพ์ใหญ่คือฝั่งขาว ตัวพิมพ์เล็กคือฝั่งดำ
//
//	K ขุน   เดิน 1 ช่องทุกทิศ
//	M เม็ด   เดินทแยง 1 ช่อง
//	S โคน   เดินทแยง 1 ช่อง หรือตรงไปข้างหน้า 1 ช่อง
//	N ม้า   เดินแบบม้าหมากรุกสากล
//	R เรือ   เดินแนวตรงกี่ช่องก็ได้
//	P เบี้ย  เดินหน้า 1 ช่อง กินทแยงหน้า 1 ช่อง
//	F เบี้ยหงาย เบี้ยที่เดินถึงแถวที่ 6 ของตัวเอง เดินแบบเม็ด
const makrukStart = "rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR"

const (
	countBoard  = "board"
	countPieces = "pieces"
	// นับศักดิ์กระดาน: 64 ตา
	boardCountLimit = 64
	// makrukQuietLimit: ระหว่างที่ยังมีเบี้ยคว่ำ (ยังนับศักดิ์ไม่ได้) ถ้าเดินครบจำนวนนี้ (ครึ่งตา)
	// โดยไม่มีการกินและไม่มีการเดินเบี้ย เกมเสมอ (ฝ่ายละ 50 ตา เหมือนหมากรุกสากล)
	// กันเกมที่เบี้ยคว่ำยันกันจนเดินไม่ได้ ซึ่งการนับศักดิ์ไม่มีวันเริ่มและเกมไม่มีวันจบ
	makrukQuietLimit = 100
)

// Makruk คือเกมหมากรุกไทยหนึ่งเกม
type Makruk struct {
	board [64]byte // ดัชนี = แถว*8 + คอลัมน์ (a1 = 0, h8 = 63) ช่องว่างคือ 0
	turn  Color
	moves []Move
	// seen นับจำนวนครั้งที่เกิดตำแหน่งเดิม (กระดาน + ฝ่ายที่ถึงตา) ใช้ตัดสินเสมอเมื่อซ้ำ 3 ครั้ง
	seen map[string]int

	count      *Count
	boardPlies int // จำนวนครึ่งตาที่เดินไปแล้วตั้งแต่เริ่มนับศักดิ์กระดาน
	quiet      int // จำนวนครึ่งตาที่เดินติดกันโดยไม่มีการกินและไม่มีการเดินเบี้ย

	result string
	reason string
}

// NewMakruk สร้างเกมหมากรุกไทยจากตำแหน่งเริ่มต้น
func NewMakruk() *Makruk {
	g, err := NewMakrukFromFEN(makrukStart + " w")
	if err != nil {
		panic(err) // ตำแหน่งเริ่มต้นเป็นค่าคงที่ของเราเอง
	}
	return g
}

// NewMakrukFromFEN สร้างเกมจากตำแหน่งที่กำหนด เช่น "4k3/8/8/8/8/8/8/R2K4 w" (ใช้ใน test)
func NewMakrukFromFEN(fen string) (*Makruk, error) {
	fields := strings.Fields(fen)
	if len(fields) != 2 || (fields[1] != "w" && fields[1] != "b") {
		return nil, fmt.Errorf("bad makruk position %q", fen)
	}
	rows := strings.Split(fields[0], "/")
	if len(rows) != 8 {
		return nil, fmt.Errorf("bad makruk position %q", fen)
	}
	g := &Makruk{turn: Color(fields[1]), seen: map[string]int{}}
	kings := map[byte]int{}
	for i, row := range rows {
		rank, file := 7-i, 0
		for _, ch := range []byte(row) {
			switch {
			case ch >= '1' && ch <= '8':
				file += int(ch - '0')
			case strings.IndexByte("KMSNRPFkmsnrpf", ch) >= 0:
				if file > 7 {
					return nil, fmt.Errorf("bad makruk position %q", fen)
				}
				g.board[rank*8+file] = ch
				kings[ch]++
				file++
			default:
				return nil, fmt.Errorf("bad makruk position %q", fen)
			}
		}
		if file != 8 {
			return nil, fmt.Errorf("bad makruk position %q", fen)
		}
	}
	if kings['K'] != 1 || kings['k'] != 1 {
		return nil, fmt.Errorf("bad makruk position %q", fen)
	}
	g.seen[g.key()] = 1
	g.updateCount("")
	return g, nil
}

func (g *Makruk) Variant() Variant { return VariantMakruk }

func colorOfPiece(p byte) Color {
	if p >= 'a' {
		return Black
	}
	return White
}

func kindOf(p byte) byte {
	if p >= 'a' {
		return p - 'a' + 'A'
	}
	return p
}

func squareName(i int) string {
	return string([]byte{byte('a' + i%8), byte('1' + i/8)})
}

func squareIndex(s string) (int, bool) {
	if len(s) != 2 || s[0] < 'a' || s[0] > 'h' || s[1] < '1' || s[1] > '8' {
		return 0, false
	}
	return int(s[1]-'1')*8 + int(s[0]-'a'), true
}

var (
	stepsKing   = [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}}
	stepsDiag   = [][2]int{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}}
	stepsRook   = [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	stepsKnight = [][2]int{{2, 1}, {2, -1}, {-2, 1}, {-2, -1}, {1, 2}, {1, -2}, {-1, 2}, {-1, -2}}
)

// targets คืนช่องที่หมากบนช่อง from ไปได้โดยยังไม่ดูว่าขุนของตัวเองจะถูกรุกหรือไม่
// ถ้า attacksOnly เป็น true คืนเฉพาะช่องที่หมากตัวนั้นคุมอยู่ (เบี้ยคุมเฉพาะช่องทแยงหน้า)
func (g *Makruk) targets(from int, attacksOnly bool) []int {
	p := g.board[from]
	if p == 0 {
		return nil
	}
	color := colorOfPiece(p)
	forward := 1
	if color == Black {
		forward = -1
	}
	rank, file := from/8, from%8
	var out []int

	// step เพิ่มช่องที่ห่างไป (dr, dc) ถ้าอยู่ในกระดานและไม่ใช่หมากฝ่ายเดียวกัน คืน true ถ้าช่องนั้นว่าง
	step := func(dr, dc int) bool {
		r, c := rank+dr, file+dc
		if r < 0 || r > 7 || c < 0 || c > 7 {
			return false
		}
		to := r*8 + c
		occupant := g.board[to]
		if occupant != 0 && colorOfPiece(occupant) == color && !attacksOnly {
			return false
		}
		out = append(out, to)
		return occupant == 0
	}

	switch kindOf(p) {
	case 'K':
		for _, d := range stepsKing {
			step(d[0], d[1])
		}
	case 'M', 'F':
		for _, d := range stepsDiag {
			step(d[0], d[1])
		}
	case 'S':
		for _, d := range stepsDiag {
			step(d[0], d[1])
		}
		step(forward, 0)
	case 'N':
		for _, d := range stepsKnight {
			step(d[0], d[1])
		}
	case 'R':
		for _, d := range stepsRook {
			for n := 1; step(d[0]*n, d[1]*n); n++ {
			}
		}
	case 'P':
		for _, dc := range []int{-1, 1} {
			r, c := rank+forward, file+dc
			if r < 0 || r > 7 || c < 0 || c > 7 {
				continue
			}
			occupant := g.board[r*8+c]
			if attacksOnly || (occupant != 0 && colorOfPiece(occupant) != color) {
				out = append(out, r*8+c)
			}
		}
		if r := rank + forward; !attacksOnly && r >= 0 && r <= 7 && g.board[r*8+file] == 0 {
			out = append(out, r*8+file)
		}
	}
	return out
}

func (g *Makruk) kingSquare(c Color) int {
	king := byte('K')
	if c == Black {
		king = 'k'
	}
	return slices.Index(g.board[:], king)
}

// inCheck บอกว่าขุนของฝ่าย c ถูกรุกอยู่หรือไม่
func (g *Makruk) inCheck(c Color) bool {
	king := g.kingSquare(c)
	for from, p := range g.board {
		if p == 0 || colorOfPiece(p) == c {
			continue
		}
		if slices.Contains(g.targets(from, true), king) {
			return true
		}
	}
	return false
}

// apply ย้ายหมากบนกระดาน (ไม่ตรวจกติกา) เบี้ยที่ถึงแถวที่ 6 ของตัวเองหงายทันที
func (g *Makruk) apply(from, to int) {
	p := g.board[from]
	g.board[from] = 0
	switch {
	case p == 'P' && to/8 == 5:
		p = 'F'
	case p == 'p' && to/8 == 2:
		p = 'f'
	}
	g.board[to] = p
}

// legalFrom คืนช่องที่หมากบน from เดินไปได้จริง (ขุนของตัวเองไม่ถูกรุกหลังเดิน)
func (g *Makruk) legalFrom(from int) []int {
	p := g.board[from]
	if p == 0 || colorOfPiece(p) != g.turn {
		return nil
	}
	var out []int
	for _, to := range g.targets(from, false) {
		saved := g.board
		g.apply(from, to)
		safe := !g.inCheck(g.turn)
		g.board = saved
		if safe {
			out = append(out, to)
		}
	}
	return out
}

func (g *Makruk) hasLegalMove() bool {
	for from := range g.board {
		if len(g.legalFrom(from)) > 0 {
			return true
		}
	}
	return false
}

// Legal คืนตาเดินที่ถูกกติกาทั้งหมดของฝ่ายที่ถึงตา
func (g *Makruk) Legal() map[string][]string {
	if g.Over() {
		return nil
	}
	out := map[string][]string{}
	for from := range g.board {
		tos := g.legalFrom(from)
		if len(tos) == 0 {
			continue
		}
		names := make([]string, len(tos))
		for i, to := range tos {
			names[i] = squareName(to)
		}
		out[squareName(from)] = names
	}
	return out
}

// Reach คืนช่องที่หมากของฝ่ายที่ยังไม่ถึงตาเดินไปได้ (ไม่ดูว่าขุนของตัวเองจะถูกรุกหรือไม่)
func (g *Makruk) Reach() map[string][]string {
	if g.Over() {
		return nil
	}
	return reachMap(&g.board, g.turn.Other(), func(from int) []int { return g.targets(from, false) })
}

// Check คืนช่องของขุนที่ถูกรุก (ของฝ่ายที่ถึงตา) หรือ ""
func (g *Makruk) Check() string {
	if g.inCheck(g.turn) {
		return squareName(g.kingSquare(g.turn))
	}
	return ""
}

// Move เดินหมากให้ฝ่ายที่ถึงตา หมากรุกไทยไม่มีการเลือกตัวเลื่อนขั้น Promo จึงต้องว่าง
func (g *Makruk) Move(m Move) error {
	if g.Over() {
		return ErrGameOver
	}
	from, okFrom := squareIndex(m.From)
	to, okTo := squareIndex(m.To)
	if !okFrom || !okTo || m.Promo != "" || !slices.Contains(g.legalFrom(from), to) {
		return ErrIllegalMove
	}
	mover := g.turn
	if g.board[to] != 0 || kindOf(g.board[from]) == 'P' {
		g.quiet = 0
	} else {
		g.quiet++
	}
	g.apply(from, to)
	g.turn = mover.Other()
	g.moves = append(g.moves, Move{From: m.From, To: m.To})
	g.seen[g.key()]++
	g.settle(mover)
	return nil
}

// settle ตัดสินว่าเกมจบหรือยังหลังฝ่าย mover เดิน
func (g *Makruk) settle(mover Color) {
	if !g.hasLegalMove() {
		if g.inCheck(g.turn) {
			g.result, g.reason = winResult(mover), ReasonCheckmate
		} else {
			g.result, g.reason = "1/2-1/2", ReasonStalemate
		}
		g.count = nil
		return
	}
	if g.pieceTotal() == 2 { // เหลือแต่ขุนสองตัว
		g.result, g.reason = "1/2-1/2", ReasonDraw
		g.count = nil
		return
	}
	if g.updateCount(mover) {
		g.result, g.reason = "1/2-1/2", ReasonCount
		return
	}
	if g.seen[g.key()] >= 3 || (g.count == nil && g.quiet >= makrukQuietLimit) {
		g.result, g.reason = "1/2-1/2", ReasonDraw
	}
}

func winResult(winner Color) string {
	if winner == White {
		return "1-0"
	}
	return "0-1"
}

func (g *Makruk) pieceTotal() int {
	n := 0
	for _, p := range g.board {
		if p != 0 {
			n++
		}
	}
	return n
}

// updateCount ปรับการนับศักดิ์หลังฝ่าย mover เดิน ("" = ตั้งต้นจากตำแหน่ง) คืน true ถ้านับครบแล้วเกมเสมอ
//
// กติกาที่ใช้ (นับให้อัตโนมัติ ผู้เล่นไม่ต้องขอนับ):
//   - ยังมีเบี้ยคว่ำบนกระดาน: ไม่นับ
//   - ฝ่ายหนึ่งเหลือขุนตัวเดียว: นับศักดิ์หมาก ฝ่ายหนีนับตาเดินของตัวเอง เริ่มจากจำนวนหมากทั้งกระดาน + 1
//     ถึงจำนวนที่กำหนดตามหมากของฝ่ายไล่ ณ ตอนเริ่มนับ ถ้าฝ่ายไล่เดินตาถัดไปแล้วยังไม่จน เกมเสมอ
//   - นอกนั้น (ไม่มีเบี้ยคว่ำ ทั้งสองฝ่ายยังมีหมาก): นับศักดิ์กระดาน ครบ 64 ตาของทั้งสองฝ่ายแล้วยังไม่จน เกมเสมอ
func (g *Makruk) updateCount(mover Color) bool {
	var pieces [2]int
	var strong [2]map[byte]int
	strong[0], strong[1] = map[byte]int{}, map[byte]int{}
	pawns := false
	for _, p := range g.board {
		if p == 0 {
			continue
		}
		side := 0
		if colorOfPiece(p) == Black {
			side = 1
		}
		pieces[side]++
		strong[side][kindOf(p)]++
		if kindOf(p) == 'P' {
			pawns = true
		}
	}
	if pawns {
		g.count = nil
		return false
	}

	if pieces[0] == 1 || pieces[1] == 1 {
		if g.count == nil || g.count.Kind != countPieces {
			bare, chaser := White, 1
			if pieces[1] == 1 {
				bare, chaser = Black, 0
			}
			g.count = &Count{Kind: countPieces, Side: bare, N: pieces[0] + pieces[1], Limit: piecesCountLimit(strong[chaser])}
			return false
		}
		if mover == g.count.Side {
			g.count.N++
			return false
		}
		return g.count.N >= g.count.Limit
	}

	if g.count == nil || g.count.Kind != countBoard {
		g.count = &Count{Kind: countBoard, Limit: boardCountLimit}
		g.boardPlies = 0
		return false
	}
	g.boardPlies++
	g.count.N = (g.boardPlies + 1) / 2
	return g.boardPlies >= boardCountLimit*2
}

// piecesCountLimit คือจำนวนที่ต้องนับในการนับศักดิ์หมาก ตามหมากของฝ่ายไล่
func piecesCountLimit(pieces map[byte]int) int {
	switch {
	case pieces['R'] >= 2:
		return 8
	case pieces['R'] == 1:
		return 16
	case pieces['S'] >= 2:
		return 22
	case pieces['N'] >= 2:
		return 32
	case pieces['S'] == 1:
		return 44
	default:
		return 64
	}
}

func (g *Makruk) Count() *Count {
	if g.count == nil || g.Over() {
		return nil
	}
	c := *g.count
	return &c
}

func (g *Makruk) Forced() bool { return false }

func (g *Makruk) Resign(c Color) { g.Forfeit(c, ReasonResign) }

func (g *Makruk) Forfeit(c Color, reason string) {
	if g.Over() {
		return
	}
	g.result, g.reason = winResult(c.Other()), reason
}

func (g *Makruk) Over() bool { return g.result != "" }

func (g *Makruk) Result() (result, reason string) { return g.result, g.reason }

func (g *Makruk) key() string { return g.placement() + " " + string(g.turn) }

func (g *Makruk) placement() string {
	var b strings.Builder
	for rank := 7; rank >= 0; rank-- {
		empty := 0
		for file := range 8 {
			p := g.board[rank*8+file]
			if p == 0 {
				empty++
				continue
			}
			if empty > 0 {
				b.WriteByte(byte('0' + empty))
				empty = 0
			}
			b.WriteByte(p)
		}
		if empty > 0 {
			b.WriteByte(byte('0' + empty))
		}
		if rank > 0 {
			b.WriteByte('/')
		}
	}
	return b.String()
}

// FEN คืนตำแหน่งปัจจุบันในรูป "<กระดาน> <ฝ่ายที่ถึงตา>" (เบี้ยหงายใช้ตัว F/f)
func (g *Makruk) FEN() string { return g.key() }

func (g *Makruk) Turn() Color { return g.turn }

func (g *Makruk) Ply() int { return len(g.moves) }

func (g *Makruk) LastMove() *Move {
	if len(g.moves) == 0 {
		return nil
	}
	m := g.moves[len(g.moves)-1]
	return &m
}

func (g *Makruk) Moves() []Move { return slices.Clone(g.moves) }

// PGN คืนบันทึกเกมเป็นรายการตาเดินแบบช่องต้นทาง-ปลายทาง (หมากรุกไทยไม่มีรูปแบบ PGN มาตรฐาน)
func (g *Makruk) PGN() string {
	var b strings.Builder
	result := g.result
	if result == "" {
		result = "*"
	}
	fmt.Fprintf(&b, "[Variant \"Makruk\"]\n[Result \"%s\"]\n\n", result)
	for i, m := range g.moves {
		if i%2 == 0 {
			fmt.Fprintf(&b, "%d. ", i/2+1)
		}
		b.WriteString(m.From + m.To + " ")
	}
	b.WriteString(result)
	return b.String()
}
