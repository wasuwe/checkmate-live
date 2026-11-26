// Package game ครอบไลบรารีหมากรุกไว้หลัง API เล็ก ๆ ที่ Room ใช้
// เซิร์ฟเวอร์เป็นผู้ตัดสินกติกาเพียงผู้เดียว ฝั่ง client ส่งมาแค่ช่องต้นทาง/ปลายทาง
package game

import (
	"errors"

	"github.com/corentings/chess/v2"
)

// Color คือสีของผู้เล่น ใช้ค่าเดียวกับใน FEN
type Color string

const (
	White Color = "w"
	Black Color = "b"
)

// Other คืนสีฝั่งตรงข้าม
func (c Color) Other() Color {
	if c == White {
		return Black
	}
	return White
}

// เหตุผลที่เกมจบ (ตรงกับคอลัมน์ games.reason ใน DESIGN.md)
const (
	ReasonCheckmate = "checkmate"
	ReasonResign    = "resign"
	ReasonTimeout   = "timeout"
	ReasonDraw      = "draw"
	ReasonStalemate = "stalemate"
	ReasonAbandon   = "abandon"
)

var (
	// ErrIllegalMove คือตาเดินที่ผิดกติกาในตำแหน่งปัจจุบัน
	ErrIllegalMove = errors.New("illegal move")
	// ErrGameOver คือพยายามเดินหลังเกมจบแล้ว
	ErrGameOver = errors.New("game over")
)

// Move คือตาเดินหนึ่งตาในรูปช่องต้นทาง/ปลายทาง เช่น e2 → e4
type Move struct {
	From  string
	To    string
	Promo string // "", "q", "r", "b", "n"
}

// Game คือเกมหมากรุกหนึ่งเกม ไม่ปลอดภัยต่อการเรียกพร้อมกัน (Room เรียกจาก goroutine เดียว)
type Game struct {
	g      *chess.Game
	ply    int
	last   *Move
	reason string // ตั้งเมื่อจบด้วยเหตุนอกกระดาน (resign, abandon, timeout)
}

// New สร้างเกมใหม่จากตำแหน่งเริ่มต้น
func New() *Game {
	return &Game{g: chess.NewGame()}
}

// NewFromFEN สร้างเกมจากตำแหน่งที่กำหนด (ใช้ใน test)
func NewFromFEN(fen string) (*Game, error) {
	opt, err := chess.FEN(fen)
	if err != nil {
		return nil, err
	}
	return &Game{g: chess.NewGame(opt)}, nil
}

var promoPieces = map[string]chess.PieceType{
	"":  chess.NoPieceType,
	"q": chess.Queen,
	"r": chess.Rook,
	"b": chess.Bishop,
	"n": chess.Knight,
}

// Move เดินหมากให้ฝั่งที่ถึงตา คืน ErrIllegalMove ถ้าผิดกติกา
// การเดินเบี้ยถึงแถวสุดท้ายต้องระบุ Promo เสมอ
func (g *Game) Move(m Move) error {
	if g.Over() {
		return ErrGameOver
	}
	promo, ok := promoPieces[m.Promo]
	if !ok {
		return ErrIllegalMove
	}
	// จับคู่กับรายการตาเดินที่ถูกกติกาเอง แทนการ parse สัญลักษณ์
	// เพื่อให้ castling / en passant ได้ flag ที่ถูกต้องจากไลบรารีเสมอ
	valid := g.g.ValidMoves()
	for i := range valid {
		v := &valid[i]
		if v.S1().String() == m.From && v.S2().String() == m.To && v.Promo() == promo {
			if err := g.g.Move(v, nil); err != nil {
				return ErrIllegalMove
			}
			g.ply++
			g.last = &Move{From: m.From, To: m.To, Promo: m.Promo}
			g.claimDraws()
			return nil
		}
	}
	return ErrIllegalMove
}

// claimDraws ตัดสินเสมออัตโนมัติเมื่อซ้ำ 3 ครั้งหรือครบกฎ 50 ตา
// (ไลบรารีตัดสินเองเฉพาะซ้ำ 5 ครั้ง / 75 ตา / หมากไม่พอ)
func (g *Game) claimDraws() {
	if g.g.Outcome() != chess.NoOutcome {
		return
	}
	for _, method := range g.g.EligibleDraws() {
		if method == chess.ThreefoldRepetition || method == chess.FiftyMoveRule {
			_ = g.g.Draw(method)
			return
		}
	}
}

// Resign ให้ฝั่ง c ยอมแพ้ ไม่มีผลถ้าเกมจบแล้ว
func (g *Game) Resign(c Color) {
	g.forfeit(c, ReasonResign)
}

// Forfeit ให้ฝั่ง c แพ้ด้วยเหตุนอกกระดาน เช่น abandon หรือ timeout
func (g *Game) Forfeit(c Color, reason string) {
	g.forfeit(c, reason)
}

func (g *Game) forfeit(c Color, reason string) {
	if g.Over() {
		return
	}
	loser := chess.White
	if c == Black {
		loser = chess.Black
	}
	g.g.Resign(loser)
	g.reason = reason
}

// Over บอกว่าเกมจบแล้วหรือยัง
func (g *Game) Over() bool {
	return g.g.Outcome() != chess.NoOutcome
}

// Result คืนผลเกม ("1-0", "0-1", "1/2-1/2") และเหตุผล ถ้าเกมยังไม่จบคืนค่าว่างทั้งคู่
func (g *Game) Result() (result, reason string) {
	if !g.Over() {
		return "", ""
	}
	result = g.g.Outcome().String()
	if g.reason != "" {
		return result, g.reason
	}
	switch g.g.Method() {
	case chess.Checkmate:
		return result, ReasonCheckmate
	case chess.Stalemate:
		return result, ReasonStalemate
	case chess.Resignation:
		return result, ReasonResign
	default:
		return result, ReasonDraw
	}
}

// FEN คืนตำแหน่งปัจจุบัน
func (g *Game) FEN() string {
	return g.g.FEN()
}

// Turn คืนสีที่ถึงตาเดิน
func (g *Game) Turn() Color {
	if g.g.Position().Turn() == chess.Black {
		return Black
	}
	return White
}

// Ply คืนจำนวนตาเดิน (ครึ่งตา) ที่เล่นไปแล้ว ใช้กันการส่งตาเดินซ้ำหรือตาเดินเก่า
func (g *Game) Ply() int {
	return g.ply
}

// LastMove คืนตาเดินล่าสุด ถ้ายังไม่มีคืน nil
func (g *Game) LastMove() *Move {
	if g.last == nil {
		return nil
	}
	m := *g.last
	return &m
}

// PGN คืนบันทึกเกมในรูป PGN
func (g *Game) PGN() string {
	return g.g.String()
}
