package hub

import (
	"errors"
	"testing"
)

func TestDecodeInboundValid(t *testing.T) {
	valid := []string{
		`{"type":"auth","token":"abc"}`,
		`{"type":"join","room":"482915"}`,
		`{"type":"move","ply":0,"from":"e2","to":"e4"}`,
		`{"type":"move","ply":12,"from":"e7","to":"e8","promo":"q"}`,
		`{"type":"move","ply":12,"from":"e2","to":"e4","promo":""}`,
		`{"type":"resign"}`,
	}
	for _, s := range valid {
		if _, err := decodeInbound([]byte(s)); err != nil {
			t.Errorf("%s: unexpected error %v", s, err)
		}
	}
}

func TestDecodeInboundRejects(t *testing.T) {
	invalid := map[string]string{
		"not json":           `hello`,
		"array":              `[]`,
		"unknown type":       `{"type":"hack"}`,
		"missing type":       `{"room":"482915"}`,
		"unknown field":      `{"type":"move","ply":0,"from":"e2","to":"e4","winner":"w"}`,
		"color from client":  `{"type":"move","ply":0,"from":"e2","to":"e4","color":"b"}`,
		"resign with ply":    `{"type":"resign","ply":3}`,
		"join with token":    `{"type":"join","room":"482915","token":"x"}`,
		"auth with room":     `{"type":"auth","token":"abc","room":"482915"}`,
		"move with text":     `{"type":"move","ply":0,"from":"e2","to":"e4","text":"hi"}`,
		"resign with winner": `{"type":"resign","winner":"w"}`,
		"resign with color":  `{"type":"resign","color":"b"}`,
		"trailing data":      `{"type":"auth","token":"abc"}{"type":"auth","token":"abc"}`,
		"empty token":        `{"type":"auth","token":""}`,
		"room too short":     `{"type":"join","room":"abc"}`,
		"room bad chars":     `{"type":"join","room":"48291a"}`,
		"room too long":      `{"type":"join","room":"4829150"}`,
		"room leading zero":  `{"type":"join","room":"082915"}`,
		"room old format":    `{"type":"join","room":"abcdefghjkmn"}`,
		"room with space":    `{"type":"join","room":"482 915"}`,
		"room as number":     `{"type":"join","room":482915}`,
		"room path":          `{"type":"join","room":"../../../etc"}`,
		"move without ply":   `{"type":"move","from":"e2","to":"e4"}`,
		"negative ply":       `{"type":"move","ply":-1,"from":"e2","to":"e4"}`,
		"ply wrong type":     `{"type":"move","ply":"0","from":"e2","to":"e4"}`,
		"square off board":   `{"type":"move","ply":0,"from":"i2","to":"e4"}`,
		"square rank 9":      `{"type":"move","ply":0,"from":"e2","to":"e9"}`,
		"square with suffix": `{"type":"move","ply":0,"from":"e2x","to":"e4"}`,
		"square uppercase":   `{"type":"move","ply":0,"from":"E2","to":"E4"}`,
		"promo to king":      `{"type":"move","ply":0,"from":"e7","to":"e8","promo":"k"}`,
		"promo too long":     `{"type":"move","ply":0,"from":"e7","to":"e8","promo":"qq"}`,
	}
	for name, s := range invalid {
		if _, err := decodeInbound([]byte(s)); !errors.Is(err, errBadMessage) {
			t.Errorf("%s: err = %v, want errBadMessage", name, err)
		}
	}
}

func TestNewRoomIDFormat(t *testing.T) {
	seen := map[string]bool{}
	for range 2000 {
		id, err := newRoomID()
		if err != nil {
			t.Fatal(err)
		}
		// ตัวเลข 6 หลักที่ไม่ขึ้นต้นด้วย 0 และตรงกับรูปแบบที่ join รับ
		if len(id) != 6 || id < "100000" || id > "999999" || !roomIDRe.MatchString(id) {
			t.Fatalf("room id %q is not a six-digit code", id)
		}
		seen[id] = true
	}
	// รหัสมี 900,000 แบบ การสุ่ม 2,000 ครั้งซ้ำกันได้บ้าง แต่ต้องกระจายเกือบทั้งหมด
	if len(seen) < 1900 {
		t.Fatalf("only %d distinct ids out of 2000; the ids are not random enough", len(seen))
	}
}
