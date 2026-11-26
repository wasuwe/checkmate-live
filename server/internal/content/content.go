// Package content คือเนื้อหาของเว็บที่ผู้ดูแล (admin) แก้ได้จากหน้าจัดการข้อมูล
// ตอนนี้มีข้อมูลหน้าเครดิต: ทีมงาน ตัวละคร OC และรูปตัวละคร
//
// ทุกอย่างที่รับเข้ามาถูกตรวจที่นี่ก่อนเก็บ เพราะข้อมูลนี้ถูกแสดงให้ทุกคนที่เปิดเว็บเห็น
package content

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"
)

// ขีดจำกัดของข้อมูลเครดิต
const (
	MaxPeople = 50
	MaxGroups = 10
	MaxOcs    = 60

	// MaxCreditsBytes คือขนาด JSON สูงสุดที่รับตอนบันทึก
	MaxCreditsBytes = 256 << 10

	// MaxImageBytes คือขนาดไฟล์รูปตัวละครสูงสุดที่รับ และ MaxImageSide คือด้านยาวสุดเป็นพิกเซล
	// (หน้าเว็บย่อรูปให้ก่อนส่งอยู่แล้ว ค่านี้กันคำขอที่ไม่ได้มาจากหน้าเว็บ)
	MaxImageBytes = 3 << 20
	MaxImageSide  = 1600

	imagePathPrefix = "/api/content-images/"
)

var (
	// ErrNotFound คือไม่มีรูปที่ขอ
	ErrNotFound = errors.New("content not found")
	// ErrBadImage คือไฟล์รูปที่ใช้ไม่ได้
	ErrBadImage = errors.New("bad image")

	idRe    = regexp.MustCompile(`^[a-z0-9_-]{1,24}$`)
	colorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

// Person คือคนหนึ่งคนในทีม หรือเจ้าของ/ผู้วาดของตัวละคร
type Person struct {
	ID string `json:"id"`
	// Rev คือเลขรุ่นของรายการ เพิ่มขึ้นทุกครั้งที่ถูกแก้ ใช้กันการแก้ทับกัน (ดู ops.go)
	Rev    int    `json:"rev"`
	Name   string `json:"name"`
	Handle string `json:"handle"`
	// Link ว่าง = ไม่เป็นลิงก์
	Link string `json:"link"`
	Bg   string `json:"bg"`
	// Image คือรูปของคนนี้ที่อัปโหลดผ่านหน้าจัดการ ("/api/content-images/<id>") หรือว่าง = ใช้ตัวอักษรย่อแทน
	Image string `json:"image"`
}

// TeamGroup คือกลุ่มของทีมตามบทบาท เช่น Developer
type TeamGroup struct {
	ID   string   `json:"id"`
	Rev  int      `json:"rev"`
	Role string   `json:"role"`
	Bg   string   `json:"bg"`
	IDs  []string `json:"ids"`
}

// Oc คือตัวละครหนึ่งตัว
type Oc struct {
	ID     string `json:"id"`
	Rev    int    `json:"rev"`
	Name   string `json:"name"`
	Title  string `json:"title"`
	Owner  string `json:"owner"`
	Artist string `json:"artist"`
	Color  string `json:"color"`
	Pale   string `json:"pale"`
	Bio    string `json:"bio"`
	// Image คือที่อยู่รูปที่อัปโหลดผ่านหน้าจัดการ ("/api/content-images/<id>") หรือว่าง
	Image string `json:"image"`
}

// Credits คือข้อมูลทั้งหมดของหน้าเครดิต
type Credits struct {
	People []Person    `json:"people"`
	Team   []TeamGroup `json:"team"`
	Ocs    []Oc        `json:"ocs"`
}

// FieldError บอกว่าช่องไหนของข้อมูลใช้ไม่ได้ เช่น "ocs[2].owner"
type FieldError struct {
	Field string
}

func (e *FieldError) Error() string { return "bad credits field: " + e.Field }

func bad(format string, args ...any) error {
	return &FieldError{Field: fmt.Sprintf(format, args...)}
}

// cleanText ตัดช่องว่างหัวท้าย และยอมรับเฉพาะข้อความที่ไม่มีอักขระควบคุม ยาวไม่เกิน max ตัวอักษร
// oneLine = ห้ามขึ้นบรรทัดใหม่ และยุบช่องว่างซ้ำ
func cleanText(s string, minRunes, maxRunes int, oneLine bool) (string, bool) {
	if !utf8.ValidString(s) {
		return "", false
	}
	if oneLine {
		s = strings.Join(strings.Fields(s), " ")
	} else {
		s = strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n"))
	}
	for _, r := range s {
		if unicode.IsControl(r) && (oneLine || r != '\n') {
			return "", false
		}
		// อักขระกลับทิศทางข้อความ ใช้ปลอมหน้าตาของข้อความได้
		if (r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069) {
			return "", false
		}
	}
	if n := utf8.RuneCountInString(s); n < minRunes || n > maxRunes {
		return "", false
	}
	return s, true
}

// cleanLink รับลิงก์ว่าง หรือ http(s) ที่มีชื่อโฮสต์ เท่านั้น
func cleanLink(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", true
	}
	if len(s) > 300 || strings.ContainsAny(s, " \t\r\n\"<>") {
		return "", false
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return "", false
	}
	return s, true
}

// Clean ตรวจและจัดรูปข้อมูลเครดิตในตัว คืน *FieldError ถ้ามีช่องที่ใช้ไม่ได้
func (c *Credits) Clean() error {
	if len(c.People) > MaxPeople {
		return bad("people")
	}
	if len(c.Team) > MaxGroups {
		return bad("team")
	}
	if len(c.Ocs) > MaxOcs {
		return bad("ocs")
	}
	// ให้เป็น [] ไม่ใช่ null ใน JSON
	if c.People == nil {
		c.People = []Person{}
	}
	if c.Team == nil {
		c.Team = []TeamGroup{}
	}
	if c.Ocs == nil {
		c.Ocs = []Oc{}
	}

	people := map[string]bool{}
	for i := range c.People {
		p := &c.People[i]
		var ok bool
		if !idRe.MatchString(p.ID) || people[p.ID] {
			return bad("people[%d].id", i)
		}
		if p.Rev < 1 {
			return bad("people[%d].rev", i)
		}
		people[p.ID] = true
		if p.Name, ok = cleanText(p.Name, 1, 40, true); !ok {
			return bad("people[%d].name", i)
		}
		if p.Handle, ok = cleanText(p.Handle, 0, 40, true); !ok {
			return bad("people[%d].handle", i)
		}
		if p.Link, ok = cleanLink(p.Link); !ok {
			return bad("people[%d].link", i)
		}
		if !colorRe.MatchString(p.Bg) {
			return bad("people[%d].bg", i)
		}
		if p.Image != "" {
			id, found := strings.CutPrefix(p.Image, imagePathPrefix)
			if !found || !ValidImageID(id) {
				return bad("people[%d].image", i)
			}
		}
	}

	groups := map[string]bool{}
	for i := range c.Team {
		g := &c.Team[i]
		var ok bool
		if !idRe.MatchString(g.ID) || groups[g.ID] {
			return bad("team[%d].id", i)
		}
		groups[g.ID] = true
		if g.Rev < 1 {
			return bad("team[%d].rev", i)
		}
		if g.Role, ok = cleanText(g.Role, 1, 30, true); !ok {
			return bad("team[%d].role", i)
		}
		if !colorRe.MatchString(g.Bg) {
			return bad("team[%d].bg", i)
		}
		if g.IDs == nil {
			g.IDs = []string{}
		}
		seen := map[string]bool{}
		for j, id := range g.IDs {
			if !people[id] || seen[id] {
				return bad("team[%d].ids[%d]", i, j)
			}
			seen[id] = true
		}
	}

	ocs := map[string]bool{}
	for i := range c.Ocs {
		o := &c.Ocs[i]
		var ok bool
		if !idRe.MatchString(o.ID) || ocs[o.ID] {
			return bad("ocs[%d].id", i)
		}
		ocs[o.ID] = true
		if o.Rev < 1 {
			return bad("ocs[%d].rev", i)
		}
		if o.Name, ok = cleanText(o.Name, 1, 40, true); !ok {
			return bad("ocs[%d].name", i)
		}
		if o.Title, ok = cleanText(o.Title, 0, 60, true); !ok {
			return bad("ocs[%d].title", i)
		}
		if o.Bio, ok = cleanText(o.Bio, 0, 400, false); !ok {
			return bad("ocs[%d].bio", i)
		}
		if !people[o.Owner] {
			return bad("ocs[%d].owner", i)
		}
		if !people[o.Artist] {
			return bad("ocs[%d].artist", i)
		}
		if !colorRe.MatchString(o.Color) {
			return bad("ocs[%d].color", i)
		}
		if !colorRe.MatchString(o.Pale) {
			return bad("ocs[%d].pale", i)
		}
		// รูปต้องเป็นรูปที่อัปโหลดผ่านเซิร์ฟเวอร์นี้เท่านั้น ไม่รับที่อยู่ภายนอก
		if o.Image != "" {
			id, found := strings.CutPrefix(o.Image, imagePathPrefix)
			if !found || !ValidImageID(id) {
				return bad("ocs[%d].image", i)
			}
		}
	}
	return nil
}

// ImagePath คืนที่อยู่ของรูปจากรหัสรูป
func ImagePath(id string) string { return imagePathPrefix + id }

// Image คือรูปที่ผ่านการตรวจและเข้ารหัสใหม่แล้ว
type Image struct {
	ContentType string
	Data        []byte
}

// ProcessImage ตรวจไฟล์รูปตัวละครและเข้ารหัสใหม่ (PNG คงความโปร่งใสไว้)
// การเข้ารหัสใหม่ทิ้งทุกอย่างที่ไม่ใช่พิกเซล (EXIF, ตำแหน่ง GPS, ข้อมูลที่ซ่อนต่อท้ายไฟล์)
func ProcessImage(data []byte) (Image, error) {
	if len(data) == 0 || len(data) > MaxImageBytes {
		return Image{}, ErrBadImage
	}
	contentType := http.DetectContentType(data) // ดูจากเนื้อไฟล์ ไม่เชื่อ Content-Type ที่ส่งมา
	if contentType != "image/jpeg" && contentType != "image/png" {
		return Image{}, ErrBadImage
	}
	// ตรวจขนาดจาก header ก่อน เพื่อไม่ต้องจองหน่วยความจำให้รูปที่ประกาศขนาดมหาศาล
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > MaxImageSide || cfg.Height > MaxImageSide {
		return Image{}, ErrBadImage
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Image{}, ErrBadImage
	}
	var out bytes.Buffer
	if contentType == "image/png" {
		err = png.Encode(&out, img)
	} else {
		err = jpeg.Encode(&out, img, &jpeg.Options{Quality: 88})
	}
	if err != nil {
		return Image{}, ErrBadImage
	}
	return Image{ContentType: contentType, Data: out.Bytes()}, nil
}

// NewImageID สุ่มรหัสรูป 128 บิต
func NewImageID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

// ValidImageID บอกว่า s มีรูปแบบของรหัสรูปหรือไม่
func ValidImageID(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// Store คือที่เก็บเนื้อหา by คือ user ID ของ admin ที่ทำรายการ (เก็บไว้ตรวจย้อนหลัง)
type Store interface {
	// Credits คืนข้อมูลเครดิตที่บันทึกไว้ หรือ nil ถ้ายังไม่เคยบันทึก
	Credits(ctx context.Context) (*Credits, error)
	// InitCredits ตั้งต้นข้อมูลเครดิต คืน ErrExists ถ้ามีข้อมูลอยู่แล้ว
	InitCredits(ctx context.Context, c Credits, by string) error
	// UpdateCredits อ่านข้อมูลล่าสุด เรียก fn ให้แก้ แล้วบันทึก ทั้งหมดเป็นขั้นตอนเดียวที่ไม่มีใครแทรกได้
	// รูปที่ข้อมูลเลิกใช้หลังแก้จะถูกลบไปพร้อมกัน ถ้า fn คืน error จะไม่มีอะไรถูกบันทึก
	// คืน ErrNoCredits ถ้ายังไม่เคยตั้งต้น คืนข้อมูลหลังแก้เมื่อสำเร็จ
	UpdateCredits(ctx context.Context, by string, fn func(c *Credits) error) (*Credits, error)
	// PieceStyles คืนรูปแบบตัวหมากที่เพิ่มไว้ (ไม่เคยเป็น nil; ยังไม่มี = รายการว่าง)
	PieceStyles(ctx context.Context) (*PieceStyles, error)
	// UpdatePieceStyles ทำงานแบบเดียวกับ UpdateCredits กับรูปแบบตัวหมาก (ยังไม่เคยมีข้อมูล = เริ่มจากรายการว่าง)
	UpdatePieceStyles(ctx context.Context, by string, fn func(p *PieceStyles) error) (*PieceStyles, error)
	SaveImage(ctx context.Context, id string, img Image, by string) error
	DeleteImage(ctx context.Context, id string) error
	Image(ctx context.Context, id string) (Image, error)
}

// Memory เก็บเนื้อหาในหน่วยความจำ ใช้เมื่อไม่ได้ตั้งฐานข้อมูล (ตอนพัฒนาและใน test)
type Memory struct {
	mu      sync.Mutex
	credits *Credits
	pieces  PieceStyles
	images  map[string]Image
}

func NewMemory() *Memory { return &Memory{images: map[string]Image{}} }

func (m *Memory) Credits(context.Context) (*Credits, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.credits == nil {
		return nil, nil
	}
	c := m.credits.Clone()
	return &c, nil
}

func (m *Memory) InitCredits(_ context.Context, c Credits, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.credits != nil {
		return ErrExists
	}
	m.credits = &c
	return nil
}

func (m *Memory) UpdateCredits(_ context.Context, _ string, fn func(c *Credits) error) (*Credits, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.credits == nil {
		return nil, ErrNoCredits
	}
	next := m.credits.Clone()
	if err := fn(&next); err != nil {
		return nil, err
	}
	for _, id := range UnusedImages(m.credits, &next) {
		delete(m.images, id)
	}
	m.credits = &next
	out := next.Clone()
	return &out, nil
}

func (m *Memory) PieceStyles(context.Context) (*PieceStyles, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := m.pieces.Clone()
	return &out, nil
}

func (m *Memory) UpdatePieceStyles(_ context.Context, _ string, fn func(p *PieceStyles) error) (*PieceStyles, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	next := m.pieces.Clone()
	if err := fn(&next); err != nil {
		return nil, err
	}
	for _, id := range UnusedPieceImages(&m.pieces, &next) {
		delete(m.images, id)
	}
	m.pieces = next
	out := next.Clone()
	return &out, nil
}

func (m *Memory) DeleteImage(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.images, id)
	return nil
}

// ImageCount คืนจำนวนรูปที่เก็บอยู่ (ใช้ใน test)
func (m *Memory) ImageCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.images)
}

func (m *Memory) SaveImage(_ context.Context, id string, img Image, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.images[id] = img
	return nil
}

func (m *Memory) Image(_ context.Context, id string) (Image, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	img, ok := m.images[id]
	if !ok {
		return Image{}, ErrNotFound
	}
	return img, nil
}
