// Package profile ดูแลชื่อที่แสดงและรูปโปรไฟล์ของผู้ใช้ที่ login
// ทุกอย่างที่ผู้ใช้ส่งมาถูกตรวจและแปลงที่นี่ก่อนเก็บ: ชื่อถูกจำกัดชุดอักขระ รูปถูกถอดรหัสแล้วเข้ารหัสใหม่
package profile

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"
)

// Profile คือข้อมูลที่ผู้เล่นคนอื่นเห็นได้
type Profile struct {
	Name string `json:"name"`
	// AvatarID คือรหัสสุ่มของรูปปัจจุบัน ("" = ไม่มีรูป) เปลี่ยนทุกครั้งที่อัปโหลดใหม่
	// จึงใช้เป็น URL ที่ cache ได้ถาวร และไม่เปิดเผย user ID
	AvatarID string `json:"avatar"`
}

// Avatar คือไฟล์รูปที่ผ่านการตรวจแล้ว
type Avatar struct {
	ContentType string
	Data        []byte
}

// Store คือที่เก็บโปรไฟล์ userID ต้องเป็นบัญชีจริง (ไม่ใช่ guest)
type Store interface {
	Get(ctx context.Context, userID string) (Profile, error)
	SetName(ctx context.Context, userID, name string) (Profile, error)
	SetAvatar(ctx context.Context, userID, avatarID string, a Avatar) (Profile, error)
	DeleteAvatar(ctx context.Context, userID string) (Profile, error)
	// Avatar คืน ErrNotFound ถ้าไม่มีรูปที่ใช้รหัสนี้
	Avatar(ctx context.Context, avatarID string) (Avatar, error)
}

var (
	ErrNotFound = errors.New("not found")
	// ErrBadImage คือไฟล์ที่ไม่ใช่ JPEG/PNG ที่ถูกต้อง หรือใหญ่เกินไป
	ErrBadImage = errors.New("bad image")
)

const (
	NameMinRunes = 3
	NameMaxRunes = 20
	// MaxAvatarBytes คือขนาดไฟล์สูงสุดที่รับ ฝั่งเว็บย่อรูปเป็น 256px ก่อนส่ง ซึ่งเล็กกว่านี้มาก
	MaxAvatarBytes = 256 << 10
	// MaxAvatarSide คือความกว้าง/สูงสูงสุดเป็นพิกเซล ตรวจจาก header ก่อนถอดรหัสทั้งรูป
	MaxAvatarSide = 512
	maxMarksInRow = 3
)

// CleanName ตรวจและจัดรูปชื่อที่แสดง คืน false ถ้าใช้ไม่ได้
// ชื่อว่างใช้ได้ หมายถึงลบชื่อออก
// อนุญาตตัวอักษรทุกภาษา ตัวเลข ช่องว่าง และ _ - . เท่านั้น จึงไม่มีอักขระควบคุม emoji หรือ HTML
func CleanName(s string) (string, bool) {
	if !utf8.ValidString(s) {
		return "", false
	}
	s = strings.Join(strings.Fields(s), " ") // ตัดหัวท้ายและยุบช่องว่างซ้ำ
	if s == "" {
		return "", true
	}
	if n := utf8.RuneCountInString(s); n < NameMinRunes || n > NameMaxRunes {
		return "", false
	}
	marks := 0
	for i, r := range s {
		switch {
		case unicode.IsMark(r):
			// สระและวรรณยุกต์ไทยเป็น mark: ต้องตามหลังตัวอักษร และซ้อนกันได้จำกัด (กันข้อความแบบ zalgo)
			marks++
			if i == 0 || marks > maxMarksInRow {
				return "", false
			}
			continue
		case unicode.IsLetter(r), unicode.IsDigit(r), r == ' ', r == '_', r == '-', r == '.':
		default:
			return "", false
		}
		marks = 0
	}
	return s, true
}

// ProcessAvatar ตรวจไฟล์ที่อัปโหลดและเข้ารหัสใหม่
// การเข้ารหัสใหม่ทิ้งทุกอย่างที่ไม่ใช่พิกเซล (EXIF, ตำแหน่ง GPS, ข้อมูลที่ซ่อนต่อท้ายไฟล์)
func ProcessAvatar(data []byte) (Avatar, error) {
	if len(data) == 0 || len(data) > MaxAvatarBytes {
		return Avatar{}, ErrBadImage
	}
	// ดูชนิดจากเนื้อไฟล์ ไม่เชื่อ Content-Type ที่ client ส่งมา
	contentType := http.DetectContentType(data)
	if contentType != "image/jpeg" && contentType != "image/png" {
		return Avatar{}, ErrBadImage
	}
	// ตรวจขนาดจาก header ก่อน เพื่อไม่ต้องจองหน่วยความจำให้รูปที่ประกาศขนาดมหาศาล
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width < 1 || cfg.Height < 1 || cfg.Width > MaxAvatarSide || cfg.Height > MaxAvatarSide {
		return Avatar{}, ErrBadImage
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Avatar{}, ErrBadImage
	}

	var out bytes.Buffer
	if contentType == "image/png" {
		err = png.Encode(&out, img)
	} else {
		err = jpeg.Encode(&out, img, &jpeg.Options{Quality: 88})
	}
	if err != nil {
		return Avatar{}, ErrBadImage
	}
	return Avatar{ContentType: contentType, Data: out.Bytes()}, nil
}

// NewAvatarID สุ่มรหัสรูป 128 บิต
func NewAvatarID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw), nil
}

// ValidAvatarID บอกว่า s มีรูปแบบของรหัสรูปหรือไม่
func ValidAvatarID(s string) bool {
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

// Memory เก็บโปรไฟล์ในหน่วยความจำ ใช้เมื่อไม่ได้ตั้งฐานข้อมูล (ตอนพัฒนาและใน test)
type Memory struct {
	mu       sync.Mutex
	profiles map[string]Profile
	avatars  map[string]Avatar
}

func NewMemory() *Memory {
	return &Memory{profiles: map[string]Profile{}, avatars: map[string]Avatar{}}
}

func (m *Memory) Get(_ context.Context, userID string) (Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.profiles[userID], nil
}

func (m *Memory) SetName(_ context.Context, userID, name string) (Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.profiles[userID]
	p.Name = name
	m.profiles[userID] = p
	return p, nil
}

func (m *Memory) SetAvatar(_ context.Context, userID, avatarID string, a Avatar) (Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.profiles[userID]
	delete(m.avatars, p.AvatarID)
	p.AvatarID = avatarID
	m.avatars[avatarID] = a
	m.profiles[userID] = p
	return p, nil
}

func (m *Memory) DeleteAvatar(_ context.Context, userID string) (Profile, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.profiles[userID]
	delete(m.avatars, p.AvatarID)
	p.AvatarID = ""
	m.profiles[userID] = p
	return p, nil
}

func (m *Memory) Avatar(_ context.Context, avatarID string) (Avatar, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.avatars[avatarID]
	if !ok {
		return Avatar{}, ErrNotFound
	}
	return a, nil
}
