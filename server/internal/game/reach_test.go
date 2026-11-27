package game

import (
	"slices"
	"strings"
	"testing"
)

func reachOf(g Engine, from string) string {
	got := slices.Clone(g.Reach()[from])
	slices.Sort(got)
	return strings.Join(got, " ")
}

// Reach คือหมากของฝ่ายที่ยังไม่ถึงตา: ตอนเริ่มเกมคือฝั่งดำ และไม่มีหมากของฝ่ายที่ถึงตาปนอยู่
func TestReachCoversOnlyTheSideNotToMove(t *testing.T) {
	for _, v := range []Variant{VariantMakruk, VariantCheckers, VariantNeeb} {
		g := NewVariant(v)
		reach, legal := g.Reach(), g.Legal()
		if len(reach) == 0 {
			t.Errorf("%s: no reach at the start", v)
		}
		for from := range reach {
			if _, both := legal[from]; both {
				t.Errorf("%s: %s is in both legal and reach", v, from)
			}
		}
	}
	if New().Reach() != nil {
		t.Error("chess computes its own moves on the web: Reach must be nil")
	}
}

func TestMakrukReach(t *testing.T) {
	g := NewMakruk()
	// เบี้ยดำ e6 เดินลงหนึ่งช่อง ม้าดำ b8 ไป d7 ได้ (a6 c6 มีเบี้ยของตัวเอง)
	if got := reachOf(g, "e6"); got != "e5" {
		t.Errorf("black pawn e6 reaches %q", got)
	}
	if got := reachOf(g, "b8"); got != "d7" {
		t.Errorf("black knight b8 reaches %q", got)
	}
}

func TestCheckersReachFollowsForcedCapture(t *testing.T) {
	// ขาวถึงตา ดำมีเบี้ย e5 ที่กิน d4 ได้ (ลง c3) ดังนั้นหมากดำตัวอื่นไม่มีตาเดิน
	g, err := NewCheckersFromFEN("8/8/1c6/4c3/3C4/8/8/6C1 w")
	if err != nil {
		t.Fatal(err)
	}
	if got := reachOf(g, "e5"); got != "c3" {
		t.Errorf("e5 reaches %q, want the capture c3", got)
	}
	if got := reachOf(g, "b6"); got != "" {
		t.Errorf("b6 reaches %q, want nothing while a capture is forced", got)
	}
}

func TestNeebReach(t *testing.T) {
	g := NewNeeb()
	// หมากดำ a8: ลงได้ทั้งคอลัมน์จนถึงหน้าหมากขาว
	if got := reachOf(g, "a8"); got != "a2 a3 a4 a5 a6 a7" {
		t.Errorf("a8 reaches %q", got)
	}
}

func TestReachIsNilWhenTheGameIsOver(t *testing.T) {
	for _, v := range []Variant{VariantMakruk, VariantCheckers, VariantNeeb} {
		g := NewVariant(v)
		g.Resign(White)
		if g.Reach() != nil {
			t.Errorf("%s: reach after the game ended", v)
		}
	}
}
