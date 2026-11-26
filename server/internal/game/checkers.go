package game

import (
	"fmt"
	"slices"
	"strings"
)

// เหตุผลที่เกมหมากฮอสจบ
const (
	// ReasonWipeout คือฝ่ายแพ้ถูกกินหมดกระดาน
	ReasonWipeout = "wipeout"
	// ReasonBlocked คือฝ่ายแพ้ยังมีหมากแต่ไม่มีตาเดิน
	ReasonBlocked = "blocked"
)

// หมากฮอสไทย: กระดาน 8×8 เล่นบนช่องสีเข้ม ฝ่ายละ 8 ตัวบนสองแถวแรก
//
//	C เบี้ย  เดินทแยงไปข้างหน้า 1 ช่อง กินโดยกระโดดข้ามหมากที่อยู่ติดกันไปข้างหน้า
//	H ฮอส   เบี้ยที่เดินถึงแถวสุดท้าย เดินทแยงกี่ช่องก็ได้ทุกทิศ กินโดยกระโดดข้ามหมากตัวแรกที่เจอ
//	        แล้วลงช่องที่อยู่ถัดจากหมากตัวนั้นทันที
//
// ตัวพิมพ์ใหญ่คือฝั่งขาว ตัวพิมพ์เล็กคือฝั่งดำ
const checkersStart = "1c1c1c1c/c1c1c1c1/8/8/8/8/1C1C1C1C/C1C1C1C1"

// quietLimit: เดินครบจำนวนนี้ (ครึ่งตา) โดยไม่มีการกินและไม่มีการเดินเบี้ย เกมเสมอ (ฝ่ายละ 40 ตา)
const quietLimit = 80

// Checkers คือเกมหมากฮอสไทยหนึ่งเกม
//
// การกินหลายต่อส่งมาทีละช่วง: หลังกินแล้วถ้าหมากตัวเดิมกินต่อได้ ตายังเป็นของฝ่ายเดิม
// และต้องเดินหมากตัวนั้นต่อ (chain) Ply จึงนับทีละช่วงของการกระโดด ไม่ใช่ทีละตา
type Checkers struct {
	board [64]byte // ดัชนี = แถว*8 + คอลัมน์ (a1 = 0) ช่องว่างคือ 0
	turn  Color
	chain int // ช่องของหมากที่ต้องกินต่อ หรือ -1
	moves []Move
	seen  map[string]int
	quiet int

	result string
	reason string
}

// NewCheckers สร้างเกมหมากฮอสจากตำแหน่งเริ่มต้น
func NewCheckers() *Checkers {
	g, err := NewCheckersFromFEN(checkersStart + " w")
	if err != nil {
		panic(err) // ตำแหน่งเริ่มต้นเป็นค่าคงที่ของเราเอง
	}
	return g
}

// NewCheckersFromFEN สร้างเกมจากตำแหน่งที่กำหนด เช่น "8/8/8/3c4/2C5/8/8/8 w" (ใช้ใน test)
func NewCheckersFromFEN(fen string) (*Checkers, error) {
	bad := fmt.Errorf("bad checkers position %q", fen)
	fields := strings.Fields(fen)
	if len(fields) != 2 || (fields[1] != "w" && fields[1] != "b") {
		return nil, bad
	}
	rows := strings.Split(fields[0], "/")
	if len(rows) != 8 {
		return nil, bad
	}
	g := &Checkers{turn: Color(fields[1]), chain: -1, seen: map[string]int{}}
	for i, row := range rows {
		rank, file := 7-i, 0
		for _, ch := range []byte(row) {
			switch {
			case ch >= '1' && ch <= '8':
				file += int(ch - '0')
			case strings.IndexByte("CHch", ch) >= 0:
				// หมากอยู่ได้เฉพาะช่องสีเข้ม (a1 เป็นช่องสีเข้ม)
				if file > 7 || (rank+file)%2 != 0 {
					return nil, bad
				}
				g.board[rank*8+file] = ch
				file++
			default:
				return nil, bad
			}
		}
		if file != 8 {
			return nil, bad
		}
	}
	g.seen[g.key()] = 1
	return g, nil
}

func (g *Checkers) Variant() Variant { return VariantCheckers }

// hop คือการเดินหนึ่งช่วง: ช่องปลายทาง และช่องของหมากที่ถูกกิน (-1 ถ้าไม่ได้กิน)
type hop struct {
	to       int
	captured int
}

func forwardOf(c Color) int {
	if c == Black {
		return -1
	}
	return 1
}

func onBoard(r, c int) bool { return r >= 0 && r <= 7 && c >= 0 && c <= 7 }

// captures คืนการกินทั้งหมดที่หมากบน from ทำได้ในช่วงเดียว
func (g *Checkers) captures(from int) []hop {
	p := g.board[from]
	if p == 0 {
		return nil
	}
	color := colorOfPiece(p)
	rank, file := from/8, from%8
	var out []hop

	if kindOf(p) == 'C' {
		dr := forwardOf(color)
		for _, dc := range []int{-1, 1} {
			mr, mc, tr, tc := rank+dr, file+dc, rank+2*dr, file+2*dc
			if !onBoard(tr, tc) {
				continue
			}
			mid := g.board[mr*8+mc]
			if mid != 0 && colorOfPiece(mid) != color && g.board[tr*8+tc] == 0 {
				out = append(out, hop{to: tr*8 + tc, captured: mr*8 + mc})
			}
		}
		return out
	}

	for _, d := range stepsDiag {
		r, c := rank+d[0], file+d[1]
		for onBoard(r, c) && g.board[r*8+c] == 0 {
			r, c = r+d[0], c+d[1]
		}
		// หมากตัวแรกที่เจอต้องเป็นของฝ่ายตรงข้าม และช่องถัดไปต้องว่าง ฮอสลงได้เฉพาะช่องนั้น
		tr, tc := r+d[0], c+d[1]
		if !onBoard(r, c) || !onBoard(tr, tc) {
			continue
		}
		if colorOfPiece(g.board[r*8+c]) != color && g.board[tr*8+tc] == 0 {
			out = append(out, hop{to: tr*8 + tc, captured: r*8 + c})
		}
	}
	return out
}

// steps คืนการเดินธรรมดา (ไม่กิน) ของหมากบน from
func (g *Checkers) steps(from int) []hop {
	p := g.board[from]
	if p == 0 {
		return nil
	}
	rank, file := from/8, from%8
	var out []hop
	if kindOf(p) == 'C' {
		dr := forwardOf(colorOfPiece(p))
		for _, dc := range []int{-1, 1} {
			if r, c := rank+dr, file+dc; onBoard(r, c) && g.board[r*8+c] == 0 {
				out = append(out, hop{to: r*8 + c, captured: -1})
			}
		}
		return out
	}
	for _, d := range stepsDiag {
		for r, c := rank+d[0], file+d[1]; onBoard(r, c) && g.board[r*8+c] == 0; r, c = r+d[0], c+d[1] {
			out = append(out, hop{to: r*8 + c, captured: -1})
		}
	}
	return out
}

// mustCapture บอกว่าฝ่ายที่ถึงตามีการกินให้เลือกหรือไม่ (ถ้ามีต้องกิน)
func (g *Checkers) mustCapture() bool {
	if g.chain >= 0 {
		return true
	}
	for from, p := range g.board {
		if p != 0 && colorOfPiece(p) == g.turn && len(g.captures(from)) > 0 {
			return true
		}
	}
	return false
}

// legalFrom คืนการเดินที่ถูกกติกาของหมากบน from
// forced คือผลของ mustCapture ที่คำนวณไว้แล้ว (ส่งเข้ามาเพื่อไม่ต้องคำนวณซ้ำทุกช่อง)
func (g *Checkers) legalFrom(from int, forced bool) []hop {
	p := g.board[from]
	if p == 0 || colorOfPiece(p) != g.turn || (g.chain >= 0 && from != g.chain) {
		return nil
	}
	if forced {
		return g.captures(from)
	}
	return g.steps(from)
}

// Legal คืนตาเดินที่ถูกกติกาทั้งหมดของฝ่ายที่ถึงตา ระหว่างกินหลายต่อจะมีเฉพาะหมากที่ต้องกินต่อ
func (g *Checkers) Legal() map[string][]string {
	if g.Over() {
		return nil
	}
	forced := g.mustCapture()
	out := map[string][]string{}
	for from := range g.board {
		hops := g.legalFrom(from, forced)
		if len(hops) == 0 {
			continue
		}
		names := make([]string, len(hops))
		for i, h := range hops {
			names[i] = squareName(h.to)
		}
		out[squareName(from)] = names
	}
	return out
}

// Forced บอกว่าฝ่ายที่ถึงตาต้องกิน (หมากฮอสบังคับกิน)
func (g *Checkers) Forced() bool { return !g.Over() && g.mustCapture() }

func (g *Checkers) Check() string { return "" }
func (g *Checkers) Count() *Count { return nil }

// Move เดินหนึ่งช่วง ถ้ากินแล้วหมากตัวเดิมยังกินต่อได้ ตายังเป็นของฝ่ายเดิม
func (g *Checkers) Move(m Move) error {
	if g.Over() {
		return ErrGameOver
	}
	from, okFrom := squareIndex(m.From)
	to, okTo := squareIndex(m.To)
	if !okFrom || !okTo || m.Promo != "" {
		return ErrIllegalMove
	}
	hops := g.legalFrom(from, g.mustCapture())
	i := slices.IndexFunc(hops, func(h hop) bool { return h.to == to })
	if i < 0 {
		return ErrIllegalMove
	}
	h := hops[i]
	mover := g.turn
	p := g.board[from]
	wasMan := kindOf(p) == 'C'

	g.board[from] = 0
	if h.captured >= 0 {
		g.board[h.captured] = 0
	}
	promoted := false
	if wasMan && ((mover == White && to/8 == 7) || (mover == Black && to/8 == 0)) {
		p += 'H' - 'C' // C → H, c → h
		promoted = true
	}
	g.board[to] = p
	g.moves = append(g.moves, Move{From: m.From, To: m.To})

	if h.captured >= 0 || wasMan {
		g.quiet = 0
	} else {
		g.quiet++
	}

	// กินต่อได้: ตายังไม่เปลี่ยน เบี้ยที่เพิ่งเป็นฮอสหยุดตรงนั้น
	if h.captured >= 0 && !promoted && len(g.captures(to)) > 0 {
		g.chain = to
		return nil
	}
	g.chain = -1
	g.turn = mover.Other()
	g.seen[g.key()]++
	g.settle(mover)
	return nil
}

// settle ตัดสินว่าเกมจบหรือยังหลังฝ่าย mover เดินจบตา
func (g *Checkers) settle(mover Color) {
	pieces := 0
	for _, p := range g.board {
		if p != 0 && colorOfPiece(p) == g.turn {
			pieces++
		}
	}
	switch {
	case pieces == 0:
		g.result, g.reason = winResult(mover), ReasonWipeout
	case len(g.Legal()) == 0:
		g.result, g.reason = winResult(mover), ReasonBlocked
	case g.seen[g.key()] >= 3 || g.quiet >= quietLimit:
		g.result, g.reason = "1/2-1/2", ReasonDraw
	}
}

func (g *Checkers) Resign(c Color) { g.Forfeit(c, ReasonResign) }

func (g *Checkers) Forfeit(c Color, reason string) {
	if g.Over() {
		return
	}
	g.result, g.reason = winResult(c.Other()), reason
}

func (g *Checkers) Over() bool { return g.result != "" }

func (g *Checkers) Result() (result, reason string) { return g.result, g.reason }

func (g *Checkers) placement() string {
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

func (g *Checkers) key() string { return g.placement() + " " + string(g.turn) }

// FEN คืนตำแหน่งปัจจุบันในรูป "<กระดาน> <ฝ่ายที่ถึงตา>"
func (g *Checkers) FEN() string { return g.key() }

func (g *Checkers) Turn() Color { return g.turn }

func (g *Checkers) Ply() int { return len(g.moves) }

func (g *Checkers) LastMove() *Move {
	if len(g.moves) == 0 {
		return nil
	}
	m := g.moves[len(g.moves)-1]
	return &m
}

func (g *Checkers) Moves() []Move { return slices.Clone(g.moves) }

// PGN คืนบันทึกเกมเป็นรายการช่วงการเดินแบบช่องต้นทาง-ปลายทาง
func (g *Checkers) PGN() string {
	var b strings.Builder
	result := g.result
	if result == "" {
		result = "*"
	}
	fmt.Fprintf(&b, "[Variant \"Thai checkers\"]\n[Result \"%s\"]\n\n", result)
	for _, m := range g.moves {
		b.WriteString(m.From + m.To + " ")
	}
	b.WriteString(result)
	return b.String()
}
