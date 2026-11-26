// Package auth ยืนยันตัวตนผู้ใช้จาก token
// เฟส 1–3 ใช้ guest token ที่เซิร์ฟเวอร์ออกเอง เฟส 4 จะเพิ่มตัวตรวจ JWT ของ Supabase
// โดย implement interface Authenticator เดียวกัน ส่วน Hub/Room ไม่ต้องแก้
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

// ErrInvalidToken คือ token ที่ตรวจไม่ผ่าน
var ErrInvalidToken = errors.New("invalid token")

// Authenticator แปลง token เป็น user ID
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (userID string, err error)
}

// Identity คือตัวตนของผู้ใช้เท่าที่ token บอกได้
type Identity struct {
	UserID string
	// Email มีเฉพาะบัญชีที่ login (ว่างสำหรับ guest) ใช้ตัดสินสิทธิ์ admin
	Email string
}

// Identifier คือ Authenticator ที่บอกอีเมลของผู้ใช้ได้ด้วย
type Identifier interface {
	Identify(ctx context.Context, token string) (Identity, error)
}

// Identify ตรวจ token แล้วคืนตัวตน ถ้า a บอกอีเมลไม่ได้ Email จะว่าง
func Identify(ctx context.Context, a Authenticator, token string) (Identity, error) {
	if id, ok := a.(Identifier); ok {
		return id.Identify(ctx, token)
	}
	userID, err := a.Authenticate(ctx, token)
	return Identity{UserID: userID}, err
}

// Guest ออกและตรวจ token ของผู้เล่นที่ไม่ได้ login
// token = "<userID>.<HMAC-SHA256(secret, userID)>" จึงปลอมเป็นคนอื่นไม่ได้แม้รู้ user ID
type Guest struct {
	secret []byte
}

const guestPrefix = "guest_"

// IsGuest บอกว่า user ID นี้เป็นของผู้เล่นที่ไม่ได้ login หรือไม่
func IsGuest(userID string) bool {
	return strings.HasPrefix(userID, guestPrefix)
}

// NewGuest สร้างตัวออก token ถ้า secret ว่างจะสุ่มใหม่
// (token เดิมจะใช้ไม่ได้หลังเซิร์ฟเวอร์รีสตาร์ต ฝั่งเว็บจะขอใหม่เอง)
func NewGuest(secret []byte) (*Guest, error) {
	if len(secret) == 0 {
		secret = make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			return nil, err
		}
	}
	return &Guest{secret: secret}, nil
}

// Issue สร้างผู้เล่น guest ใหม่ คืน user ID และ token
func (g *Guest) Issue() (userID, token string, err error) {
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	userID = guestPrefix + hex.EncodeToString(raw)
	return userID, userID + "." + g.sign(userID), nil
}

// Authenticate ตรวจ token แล้วคืน user ID
func (g *Guest) Authenticate(_ context.Context, token string) (string, error) {
	userID, sig, ok := strings.Cut(token, ".")
	if !ok || !strings.HasPrefix(userID, guestPrefix) || len(userID) > 64 {
		return "", ErrInvalidToken
	}
	if !hmac.Equal([]byte(sig), []byte(g.sign(userID))) {
		return "", ErrInvalidToken
	}
	return userID, nil
}

func (g *Guest) sign(userID string) string {
	mac := hmac.New(sha256.New, g.secret)
	mac.Write([]byte(userID))
	return hex.EncodeToString(mac.Sum(nil))
}
