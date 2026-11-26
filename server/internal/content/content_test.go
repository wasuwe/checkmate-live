package content

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

func validCredits() Credits {
	return Credits{
		People: []Person{
			{ID: "nok", Name: "Nok", Handle: "@nok.dev", Link: "https://example.com/nok", Bg: "#FFB8CC"},
			{ID: "mew", Name: "Mew", Handle: "", Link: "", Bg: "#9fe3c9"},
		},
		Team: []TeamGroup{{Role: "Developer", Bg: "#A9D6F7", IDs: []string{"nok"}}},
		Ocs: []Oc{{
			ID: "kaimuk", Name: "ไข่มุก", Title: "ราชินีขนมหวาน", Owner: "mew", Artist: "nok",
			Color: "#FF8FB1", Pale: "#FFE8EF", Bio: "ชอบกินขนม\nระหว่างเดินหมาก",
			Image: "/api/content-images/0123456789abcdef0123456789abcdef",
		}},
	}
}

func TestCleanAcceptsValidCredits(t *testing.T) {
	c := validCredits()
	c.People[0].Name = "  Nok   Dev  "
	c.Ocs[0].Bio = "  บรรทัดแรก\r\nบรรทัดสอง  "
	if err := c.Clean(); err != nil {
		t.Fatal(err)
	}
	if c.People[0].Name != "Nok Dev" {
		t.Errorf("name = %q, want spaces collapsed", c.People[0].Name)
	}
	if c.Ocs[0].Bio != "บรรทัดแรก\nบรรทัดสอง" {
		t.Errorf("bio = %q", c.Ocs[0].Bio)
	}

	// ข้อมูลว่างใช้ได้ และได้ slice ว่าง (ไม่ใช่ null ใน JSON)
	empty := Credits{}
	if err := empty.Clean(); err != nil || empty.People == nil || empty.Team == nil || empty.Ocs == nil {
		t.Fatalf("empty credits: err=%v %+v", err, empty)
	}
}

func TestCleanRejectsBadFields(t *testing.T) {
	tests := []struct {
		field string
		edit  func(c *Credits)
	}{
		{"people[0].id", func(c *Credits) { c.People[0].ID = "Nok Dev" }},
		{"people[1].id", func(c *Credits) { c.People[1].ID = "nok" }}, // ซ้ำ
		{"people[0].name", func(c *Credits) { c.People[0].Name = "" }},
		{"people[0].name", func(c *Credits) { c.People[0].Name = strings.Repeat("ก", 41) }},
		{"people[0].name", func(c *Credits) { c.People[0].Name = "a‮b" }}, // อักขระกลับทิศทาง
		{"people[0].handle", func(c *Credits) { c.People[0].Handle = "a\x00b" }},
		{"people[0].link", func(c *Credits) { c.People[0].Link = "javascript:alert(1)" }},
		{"people[0].link", func(c *Credits) { c.People[0].Link = "//example.com" }},
		{"people[0].link", func(c *Credits) { c.People[0].Link = "https://user:pass@example.com" }},
		{"people[0].link", func(c *Credits) { c.People[0].Link = "https://example.com/\"><script>" }},
		{"people[0].bg", func(c *Credits) { c.People[0].Bg = "red" }},
		{"people[0].bg", func(c *Credits) { c.People[0].Bg = "#fff;background:url(x)" }},
		{"team[0].role", func(c *Credits) { c.Team[0].Role = " " }},
		{"team[0].bg", func(c *Credits) { c.Team[0].Bg = "" }},
		{"team[0].ids[0]", func(c *Credits) { c.Team[0].IDs = []string{"ghost"} }},
		{"team[0].ids[1]", func(c *Credits) { c.Team[0].IDs = []string{"nok", "nok"} }},
		{"ocs[0].id", func(c *Credits) { c.Ocs[0].ID = "" }},
		{"ocs[0].name", func(c *Credits) { c.Ocs[0].Name = "" }},
		{"ocs[0].bio", func(c *Credits) { c.Ocs[0].Bio = strings.Repeat("ก", 401) }},
		{"ocs[0].owner", func(c *Credits) { c.Ocs[0].Owner = "ghost" }},
		{"ocs[0].artist", func(c *Credits) { c.Ocs[0].Artist = "" }},
		{"ocs[0].color", func(c *Credits) { c.Ocs[0].Color = "#12345" }},
		{"ocs[0].pale", func(c *Credits) { c.Ocs[0].Pale = "pink" }},
		// รูปต้องเป็นรูปที่อัปโหลดผ่านเซิร์ฟเวอร์นี้เท่านั้น
		{"ocs[0].image", func(c *Credits) { c.Ocs[0].Image = "https://evil.example/x.png" }},
		{"ocs[0].image", func(c *Credits) { c.Ocs[0].Image = "/api/content-images/../../etc/passwd" }},
		{"ocs[0].image", func(c *Credits) { c.Ocs[0].Image = "/api/content-images/XYZ" }},
		{"people", func(c *Credits) { c.People = make([]Person, MaxPeople+1) }},
		{"ocs", func(c *Credits) { c.Ocs = make([]Oc, MaxOcs+1) }},
		{"team", func(c *Credits) { c.Team = make([]TeamGroup, MaxGroups+1) }},
	}
	for _, tt := range tests {
		c := validCredits()
		tt.edit(&c)
		err := c.Clean()
		var field *FieldError
		if !errors.As(err, &field) || field.Field != tt.field {
			t.Errorf("want error on %s, got %v", tt.field, err)
		}
	}
}

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	img.Set(0, 0, color.NRGBA{R: 255, A: 128})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestProcessImage(t *testing.T) {
	src := pngBytes(t, 40, 60)
	// ข้อมูลที่ซ่อนต่อท้ายไฟล์ต้องไม่รอดจากการเข้ารหัสใหม่
	out, err := ProcessImage(append(bytes.Clone(src), []byte("<script>alert(1)</script>")...))
	if err != nil {
		t.Fatal(err)
	}
	if out.ContentType != "image/png" || bytes.Contains(out.Data, []byte("<script>")) {
		t.Fatalf("processed image: type=%s", out.ContentType)
	}
	img, err := png.Decode(bytes.NewReader(out.Data))
	if err != nil || img.Bounds().Dx() != 40 || img.Bounds().Dy() != 60 {
		t.Fatalf("re-encoded image: %v %v", img.Bounds(), err)
	}
	// ความโปร่งใสต้องคงอยู่ (รูปตัวละครพื้นหลังโปร่ง)
	if _, _, _, a := img.At(1, 1).RGBA(); a != 0 {
		t.Errorf("transparent pixel became opaque (alpha %d)", a)
	}

	var jpg bytes.Buffer
	if err := jpeg.Encode(&jpg, image.NewRGBA(image.Rect(0, 0, 20, 20)), nil); err != nil {
		t.Fatal(err)
	}
	if out, err := ProcessImage(jpg.Bytes()); err != nil || out.ContentType != "image/jpeg" {
		t.Fatalf("jpeg: %v %s", err, out.ContentType)
	}

	for name, data := range map[string][]byte{
		"empty":       nil,
		"html":        []byte("<html><script>alert(1)</script></html>"),
		"svg":         []byte(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`),
		"gif":         []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;"),
		"truncated":   src[:len(src)/2],
		"too wide":    pngBytes(t, MaxImageSide+1, 1),
		"too tall":    pngBytes(t, 1, MaxImageSide+1),
		"png in name": []byte("not really a png"),
	} {
		if _, err := ProcessImage(data); !errors.Is(err, ErrBadImage) {
			t.Errorf("%s: err = %v, want ErrBadImage", name, err)
		}
	}
}

func TestImageIDs(t *testing.T) {
	a, err := NewImageID()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := NewImageID()
	if a == b || !ValidImageID(a) || ImagePath(a) != "/api/content-images/"+a {
		t.Fatalf("ids: %q %q", a, b)
	}
	for _, bad := range []string{"", "abc", strings.Repeat("g", 32), strings.Repeat("A", 32), a + "0", "../" + a[3:]} {
		if ValidImageID(bad) {
			t.Errorf("ValidImageID(%q) = true", bad)
		}
	}
}

func TestMemoryStore(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	if c, err := m.Credits(ctx); c != nil || err != nil {
		t.Fatalf("empty store: %v %v", c, err)
	}
	want := validCredits()
	if err := m.SaveCredits(ctx, want, "admin-1"); err != nil {
		t.Fatal(err)
	}
	got, err := m.Credits(ctx)
	if err != nil || got == nil || got.Ocs[0].Name != "ไข่มุก" {
		t.Fatalf("saved credits: %+v %v", got, err)
	}
	if _, err := m.Image(ctx, "0123456789abcdef0123456789abcdef"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing image: %v", err)
	}
	if err := m.SaveImage(ctx, "0123456789abcdef0123456789abcdef", Image{ContentType: "image/png", Data: []byte{1}}, "admin-1"); err != nil {
		t.Fatal(err)
	}
	if img, err := m.Image(ctx, "0123456789abcdef0123456789abcdef"); err != nil || img.ContentType != "image/png" {
		t.Fatalf("saved image: %+v %v", img, err)
	}
}
