package game

import (
	"fmt"
	"slices"
	"strings"
)

// หมากหนีบ: กระดาน 8×8 ฝ่ายละ 8 ตัวเรียงบนแถวแรกของตัวเอง หมากทุกตัวเหมือนกัน (ตัวอักษร O / o)
//
//   - เดินแนวตรงกี่ช่องก็ได้แบบเรือ ข้ามหมากไม่ได้
//   - หนีบ: เดินไปประกบหมากฝ่ายตรงข้ามที่เรียงติดกัน (1 ตัวขึ้นไป) ไว้ระหว่างหมากที่เดินกับหมากของเราอีกตัว
//     ในแนวตรงเดียวกัน กินหมากที่ถูกประกบทั้งหมด
//   - สอด: เดินเข้าไปอยู่ระหว่างหมากฝ่ายตรงข้าม 2 ตัวที่อยู่ติดสองข้างในแนวเดียวกัน กินทั้ง 2 ตัว
//   - การกินเกิดจากการเดินของฝ่ายที่กินเท่านั้น หมากที่เดินเข้าไปอยู่ระหว่างหมากฝ่ายตรงข้ามเองไม่ถูกกิน
//   - ไม่บังคับกิน ตาหนึ่งเดินหมากตัวเดียว
const neebStart = "oooooooo/8/8/8/8/8/8/OOOOOOOO"

// neebQuietLimit: เดินครบจำนวนนี้ (ครึ่งตา) โดยไม่มีการกิน เกมเสมอ (ฝ่ายละ 50 ตา)
const neebQuietLimit = 100

// Neeb คือเกมหมากหนีบหนึ่งเกม
type Neeb struct {
	board [64]byte // ดัชนี = แถว*8 + คอลัมน์ (a1 = 0) ช่องว่างคือ 0
	turn  Color
	moves []Move
	seen  map[string]int
	quiet int

	result string
	reason string
}

// NewNeeb สร้างเกมหมากหนีบจากตำแหน่งเริ่มต้น
func NewNeeb() *Neeb {
	g, err := NewNeebFromFEN(neebStart + " w")
	if err != nil {
		panic(err) // ตำแหน่งเริ่มต้นเป็นค่าคงที่ของเราเอง
	}
	return g
}

// NewNeebFromFEN สร้างเกมจากตำแหน่งที่กำหนด เช่น "8/8/8/8/8/8/8/OoO5 w" (ใช้ใน test)
func NewNeebFromFEN(fen string) (*Neeb, error) {
	bad := fmt.Errorf("bad neeb position %q", fen)
	fields := strings.Fields(fen)
	if len(fields) != 2 || (fields[1] != "w" && fields[1] != "b") {
		return nil, bad
	}
	rows := strings.Split(fields[0], "/")
	if len(rows) != 8 {
		return nil, bad
	}
	g := &Neeb{turn: Color(fields[1]), seen: map[string]int{}}
	for i, row := range rows {
		rank, file := 7-i, 0
		for _, ch := range []byte(row) {
			switch {
			case ch >= '1' && ch <= '8':
				file += int(ch - '0')
			case ch == 'O' || ch == 'o':
				if file > 7 {
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

func (g *Neeb) Variant() Variant { return VariantNeeb }

// slides คืนช่องที่หมากบน from เดินไปได้ (แนวตรง จนกว่าจะเจอหมากหรือขอบกระดาน)
func (g *Neeb) slides(from int) []int {
	p := g.board[from]
	if p == 0 || colorOfPiece(p) != g.turn {
		return nil
	}
	rank, file := from/8, from%8
	var out []int
	for _, d := range stepsRook {
		for r, c := rank+d[0], file+d[1]; onBoard(r, c) && g.board[r*8+c] == 0; r, c = r+d[0], c+d[1] {
			out = append(out, r*8+c)
		}
	}
	return out
}

// capturedBy คืนช่องของหมากฝ่ายตรงข้ามที่ถูกกินเมื่อหมากของฝ่าย mover เพิ่งเดินมาถึงช่อง at
func (g *Neeb) capturedBy(at int, mover Color) []int {
	rank, file := at/8, at%8
	enemy := func(r, c int) bool {
		return onBoard(r, c) && g.board[r*8+c] != 0 && colorOfPiece(g.board[r*8+c]) != mover
	}
	own := func(r, c int) bool {
		return onBoard(r, c) && g.board[r*8+c] != 0 && colorOfPiece(g.board[r*8+c]) == mover
	}
	var out []int
	add := func(sq int) {
		if !slices.Contains(out, sq) {
			out = append(out, sq)
		}
	}

	// หนีบ: หมากฝ่ายตรงข้ามที่เรียงติดกันจากช่องนี้ และปิดท้ายด้วยหมากของเรา
	for _, d := range stepsRook {
		r, c := rank+d[0], file+d[1]
		var run []int
		for enemy(r, c) {
			run = append(run, r*8+c)
			r, c = r+d[0], c+d[1]
		}
		if len(run) > 0 && own(r, c) {
			for _, sq := range run {
				add(sq)
			}
		}
	}
	// สอด: หมากฝ่ายตรงข้ามอยู่ติดสองข้างในแนวเดียวกัน
	for _, d := range [][2]int{{1, 0}, {0, 1}} {
		if enemy(rank+d[0], file+d[1]) && enemy(rank-d[0], file-d[1]) {
			add((rank+d[0])*8 + file + d[1])
			add((rank-d[0])*8 + file - d[1])
		}
	}
	return out
}

// Legal คืนตาเดินที่ถูกกติกาทั้งหมดของฝ่ายที่ถึงตา
func (g *Neeb) Legal() map[string][]string {
	if g.Over() {
		return nil
	}
	out := map[string][]string{}
	for from := range g.board {
		tos := g.slides(from)
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

func (g *Neeb) Check() string { return "" }
func (g *Neeb) Count() *Count { return nil }
func (g *Neeb) Forced() bool  { return false }

// Move เดินหมากหนึ่งตัว แล้วกินหมากที่ถูกหนีบหรือถูกสอด
func (g *Neeb) Move(m Move) error {
	if g.Over() {
		return ErrGameOver
	}
	from, okFrom := squareIndex(m.From)
	to, okTo := squareIndex(m.To)
	if !okFrom || !okTo || m.Promo != "" || !slices.Contains(g.slides(from), to) {
		return ErrIllegalMove
	}
	mover := g.turn
	g.board[to], g.board[from] = g.board[from], 0
	captured := g.capturedBy(to, mover)
	for _, sq := range captured {
		g.board[sq] = 0
	}
	if len(captured) > 0 {
		g.quiet = 0
	} else {
		g.quiet++
	}
	g.moves = append(g.moves, Move{From: m.From, To: m.To})
	g.turn = mover.Other()
	g.seen[g.key()]++

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
	case g.seen[g.key()] >= 3 || g.quiet >= neebQuietLimit:
		g.result, g.reason = "1/2-1/2", ReasonDraw
	}
	return nil
}

func (g *Neeb) Resign(c Color) { g.Forfeit(c, ReasonResign) }

func (g *Neeb) Forfeit(c Color, reason string) {
	if g.Over() {
		return
	}
	g.result, g.reason = winResult(c.Other()), reason
}

func (g *Neeb) Over() bool { return g.result != "" }

func (g *Neeb) Result() (result, reason string) { return g.result, g.reason }

func (g *Neeb) key() string {
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
	return b.String() + " " + string(g.turn)
}

// FEN คืนตำแหน่งปัจจุบันในรูป "<กระดาน> <ฝ่ายที่ถึงตา>"
func (g *Neeb) FEN() string { return g.key() }

func (g *Neeb) Turn() Color { return g.turn }

func (g *Neeb) Ply() int { return len(g.moves) }

func (g *Neeb) LastMove() *Move {
	if len(g.moves) == 0 {
		return nil
	}
	m := g.moves[len(g.moves)-1]
	return &m
}

func (g *Neeb) Moves() []Move { return slices.Clone(g.moves) }

// PGN คืนบันทึกเกมเป็นรายการตาเดินแบบช่องต้นทาง-ปลายทาง
func (g *Neeb) PGN() string {
	var b strings.Builder
	result := g.result
	if result == "" {
		result = "*"
	}
	fmt.Fprintf(&b, "[Variant \"Mak neeb\"]\n[Result \"%s\"]\n\n", result)
	for i, m := range g.moves {
		if i%2 == 0 {
			fmt.Fprintf(&b, "%d. ", i/2+1)
		}
		b.WriteString(m.From + m.To + " ")
	}
	b.WriteString(result)
	return b.String()
}
