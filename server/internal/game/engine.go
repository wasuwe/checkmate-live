package game

import "fmt"

// Variant คือชนิดของเกมกระดานที่ห้องหนึ่งเล่น
type Variant string

const (
	VariantChess    Variant = "chess"
	VariantMakruk   Variant = "makruk"
	VariantCheckers Variant = "checkers"
	VariantNeeb     Variant = "neeb"
)

// ParseVariant แปลงชื่อเกมจากภายนอก ค่าว่างคือหมากรุกสากล (ห้องที่สร้างก่อนมีหลายเกม)
func ParseVariant(s string) (Variant, bool) {
	switch Variant(s) {
	case "", VariantChess:
		return VariantChess, true
	case VariantMakruk:
		return VariantMakruk, true
	case VariantCheckers:
		return VariantCheckers, true
	case VariantNeeb:
		return VariantNeeb, true
	}
	return "", false
}

// Count คือการนับศักดิ์ของหมากรุกไทยที่กำลังเดินอยู่
type Count struct {
	// Kind คือ "board" (นับศักดิ์กระดาน) หรือ "pieces" (นับศักดิ์หมาก)
	Kind string `json:"kind"`
	// N คือเลขที่นับถึงแล้ว เมื่อถึง Limit โดยยังไม่จน เกมเสมอ
	N     int `json:"n"`
	Limit int `json:"limit"`
	// Side คือฝ่ายที่เป็นผู้นับ (ฝ่ายหนี) มีเฉพาะนับศักดิ์หมาก
	Side Color `json:"side,omitempty"`
}

// Engine คือกติกาของเกมหนึ่งเกม Room ใช้ผ่าน interface นี้โดยไม่ต้องรู้ว่าเป็นเกมอะไร
// ไม่ปลอดภัยต่อการเรียกพร้อมกัน (Room เรียกจาก goroutine เดียว)
type Engine interface {
	Variant() Variant
	Move(Move) error
	Resign(Color)
	Forfeit(c Color, reason string)
	Over() bool
	Result() (result, reason string)
	FEN() string
	Turn() Color
	Ply() int
	LastMove() *Move
	Moves() []Move
	PGN() string
	// Legal คืนตาเดินที่ถูกกติกาของฝ่ายที่ถึงตา (ช่องต้นทาง → ช่องปลายทาง)
	// คืน nil ถ้าเกมนั้นให้หน้าเว็บคำนวณเอง (หมากรุกสากล) หรือเกมจบแล้ว
	Legal() map[string][]string
	// Check คืนช่องของขุนที่กำลังถูกรุก หรือ "" (หมากรุกสากลให้หน้าเว็บคำนวณเอง)
	Check() string
	// Count คืนการนับศักดิ์ที่กำลังเดินอยู่ หรือ nil
	Count() *Count
	// Forced บอกว่าฝ่ายที่ถึงตาถูกบังคับให้กิน (หมากฮอส)
	Forced() bool
}

// NewVariant สร้างเกมใหม่ของชนิดที่กำหนดจากตำแหน่งเริ่มต้น
func NewVariant(v Variant) Engine {
	switch v {
	case VariantMakruk:
		return NewMakruk()
	case VariantCheckers:
		return NewCheckers()
	case VariantNeeb:
		return NewNeeb()
	}
	return New()
}

// ReplayVariant สร้างเกมจากตำแหน่งเริ่มต้นแล้วเดินตามลำดับที่ให้มา ใช้กู้เกมคืนจากที่บันทึกไว้
// ทุกตาถูกตรวจกติกาใหม่ ข้อมูลที่บันทึกไว้จึงทำให้เกิดตำแหน่งที่ผิดกติกาไม่ได้
func ReplayVariant(v Variant, moves []Move) (Engine, error) {
	g := NewVariant(v)
	for i, m := range moves {
		if err := g.Move(m); err != nil {
			return nil, fmt.Errorf("move %d (%s%s%s): %w", i+1, m.From, m.To, m.Promo, err)
		}
	}
	return g, nil
}

// Variant, Legal, Check, Count ของหมากรุกสากล: หน้าเว็บมีไลบรารีกติกาของตัวเองอยู่แล้ว
func (g *Game) Variant() Variant           { return VariantChess }
func (g *Game) Legal() map[string][]string { return nil }
func (g *Game) Check() string              { return "" }
func (g *Game) Count() *Count              { return nil }
func (g *Game) Forced() bool               { return false }
