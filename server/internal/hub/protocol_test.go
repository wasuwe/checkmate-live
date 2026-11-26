package hub

import (
	"errors"
	"testing"
)

func TestDecodeInboundValid(t *testing.T) {
	valid := []string{
		`{"type":"auth","token":"abc"}`,
		`{"type":"join","room":"abcdefghjkmn"}`,
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
		"missing type":       `{"room":"abcdefghjkmn"}`,
		"unknown field":      `{"type":"move","ply":0,"from":"e2","to":"e4","winner":"w"}`,
		"color from client":  `{"type":"move","ply":0,"from":"e2","to":"e4","color":"b"}`,
		"resign with winner": `{"type":"resign","winner":"w"}`,
		"resign with color":  `{"type":"resign","color":"b"}`,
		"trailing data":      `{"type":"auth","token":"abc"}{"type":"auth","token":"abc"}`,
		"empty token":        `{"type":"auth","token":""}`,
		"room too short":     `{"type":"join","room":"abc"}`,
		"room bad chars":     `{"type":"join","room":"ABCDEFGHJKMN"}`,
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
	for range 200 {
		id, err := newRoomID()
		if err != nil {
			t.Fatal(err)
		}
		if !roomIDRe.MatchString(id) {
			t.Fatalf("room id %q does not match the join pattern", id)
		}
		if seen[id] {
			t.Fatalf("duplicate room id %q", id)
		}
		seen[id] = true
	}
}
