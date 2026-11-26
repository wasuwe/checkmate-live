package profile

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func TestCleanName(t *testing.T) {
	good := map[string]string{
		"":                      "",
		"   ":                   "",
		"Wasu":                  "Wasu",
		"  Wasu   W.  ":         "Wasu W.",
		"น้ำผึ้ง":               "น้ำผึ้ง",
		"ผู้เล่น_01":            "ผู้เล่น_01",
		"José-María":            "José-María",
		"abc":                   "abc",
		strings.Repeat("a", 20): strings.Repeat("a", 20),
	}
	for in, want := range good {
		got, ok := CleanName(in)
		if !ok || got != want {
			t.Errorf("CleanName(%q) = %q, %v; want %q, true", in, got, ok, want)
		}
	}

	bad := []string{
		"ab",                    // สั้นเกิน
		strings.Repeat("a", 21), // ยาวเกิน
		"<b>bold</b>",
		"name‮evil", // ตัวกลับทิศทางข้อความ
		"tab\there\x00",
		"line\x07bell",
		"smile 😀",
		"a​b​c",    // zero-width space
		"้abc",     // ขึ้นต้นด้วยวรรณยุกต์
		"á́́́bcd", // mark ซ้อนเกิน
		"admin@site",
		"\xff\xfe\xfd",
	}
	for _, in := range bad {
		if got, ok := CleanName(in); ok {
			t.Errorf("CleanName(%q) = %q, true; want rejected", in, got)
		}
	}
}

func encode(t *testing.T, w, h int, asPNG bool) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	var err error
	if asPNG {
		err = png.Encode(&buf, img)
	} else {
		err = jpeg.Encode(&buf, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestProcessAvatarAcceptsAndReencodes(t *testing.T) {
	for _, asPNG := range []bool{false, true} {
		src := encode(t, 256, 256, asPNG)
		// ข้อมูลที่แอบต่อท้ายไฟล์ต้องไม่รอดจากการเข้ารหัสใหม่
		tagged := append(append([]byte{}, src...), []byte("<script>alert(1)</script>")...)
		got, err := ProcessAvatar(tagged)
		if err != nil {
			t.Fatalf("png=%v: %v", asPNG, err)
		}
		want := "image/jpeg"
		if asPNG {
			want = "image/png"
		}
		if got.ContentType != want {
			t.Errorf("content type = %q, want %q", got.ContentType, want)
		}
		if bytes.Contains(got.Data, []byte("<script>")) {
			t.Errorf("png=%v: trailing data survived re-encoding", asPNG)
		}
		cfg, _, err := image.DecodeConfig(bytes.NewReader(got.Data))
		if err != nil || cfg.Width != 256 || cfg.Height != 256 {
			t.Errorf("png=%v: output is not a 256x256 image: %v %v", asPNG, cfg, err)
		}
	}
}

func TestProcessAvatarRejects(t *testing.T) {
	gif := []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	html := []byte("<!doctype html><script>alert(1)</script>")
	pngHeaderOnly := encode(t, 16, 16, true)[:40]

	cases := map[string][]byte{
		"empty":          nil,
		"gif":            gif,
		"svg":            svg,
		"html":           html,
		"truncated png":  pngHeaderOnly,
		"too wide":       encode(t, MaxAvatarSide+1, 8, true),
		"too tall":       encode(t, 8, MaxAvatarSide+1, true),
		"too many bytes": append(encode(t, 16, 16, true), make([]byte, MaxAvatarBytes)...),
	}
	for name, data := range cases {
		if _, err := ProcessAvatar(data); !errors.Is(err, ErrBadImage) {
			t.Errorf("%s: err = %v, want ErrBadImage", name, err)
		}
	}
}

func TestAvatarID(t *testing.T) {
	a, err := NewAvatarID()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewAvatarID()
	if a == b || !ValidAvatarID(a) || !ValidAvatarID(b) {
		t.Fatalf("ids %q %q", a, b)
	}
	for _, bad := range []string{"", "abc", strings.Repeat("g", 32), strings.Repeat("A", 32), a + "0", "../" + a[3:]} {
		if ValidAvatarID(bad) {
			t.Errorf("ValidAvatarID(%q) = true", bad)
		}
	}
}

func TestMemoryStore(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()

	if p, _ := m.Get(ctx, "u1"); p != (Profile{}) {
		t.Fatalf("new user has profile %+v", p)
	}
	if p, _ := m.SetName(ctx, "u1", "Alice"); p.Name != "Alice" {
		t.Fatalf("after SetName: %+v", p)
	}
	p, _ := m.SetAvatar(ctx, "u1", "id1", Avatar{ContentType: "image/png", Data: []byte("one")})
	if p != (Profile{Name: "Alice", AvatarID: "id1"}) {
		t.Fatalf("after SetAvatar: %+v", p)
	}
	// รูปใหม่แทนรูปเก่า และรหัสเก่าใช้ไม่ได้อีก
	m.SetAvatar(ctx, "u1", "id2", Avatar{ContentType: "image/png", Data: []byte("two")})
	if _, err := m.Avatar(ctx, "id1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old avatar still served: %v", err)
	}
	if a, err := m.Avatar(ctx, "id2"); err != nil || string(a.Data) != "two" {
		t.Fatalf("new avatar: %v %v", a, err)
	}
	if p, _ := m.Get(ctx, "u2"); p != (Profile{}) {
		t.Fatalf("other user sees %+v", p)
	}
	if p, _ := m.DeleteAvatar(ctx, "u1"); p != (Profile{Name: "Alice"}) {
		t.Fatalf("after DeleteAvatar: %+v", p)
	}
	if _, err := m.Avatar(ctx, "id2"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted avatar still served: %v", err)
	}
}
