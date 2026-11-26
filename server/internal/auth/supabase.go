package auth

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

// supabaseAudience คือค่า aud ใน JWT ของผู้ใช้ที่ login แล้ว
// (anon key มี role=anon และไม่มี sub จึงใช้แทนตัวผู้ใช้ไม่ได้)
const supabaseAudience = "authenticated"

const jwksSuffix = "/.well-known/jwks.json"

// Supabase ตรวจ JWT ที่ Supabase Auth ออกให้ โดยใช้ public key จาก JWKS
// โปรเจกต์ Supabase ต้องใช้ signing key แบบ asymmetric (ES256 หรือ RS256)
// เซิร์ฟเวอร์ไม่ถือ secret ใด ๆ ของ Supabase
type Supabase struct {
	keys   keyfunc.Keyfunc
	parser *jwt.Parser
}

// NewSupabase สร้างตัวตรวจจาก URL ของ JWKS
// เช่น https://<ref>.supabase.co/auth/v1/.well-known/jwks.json
// กุญแจถูกดึงและ refresh เบื้องหลังจนกว่า ctx จะถูกยกเลิก
// ถ้าดึงครั้งแรกไม่สำเร็จเซิร์ฟเวอร์ยังเริ่มได้ และจะลองใหม่เมื่อเจอ token
func NewSupabase(ctx context.Context, jwksURL string) (*Supabase, error) {
	if !strings.HasPrefix(jwksURL, "https://") && !strings.HasPrefix(jwksURL, "http://") {
		return nil, fmt.Errorf("supabase jwks url must be http(s): %q", jwksURL)
	}
	keys, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, fmt.Errorf("load supabase jwks: %w", err)
	}

	opts := []jwt.ParserOption{
		// รับเฉพาะอัลกอริทึมแบบ asymmetric: กัน alg=none และการสลับไปใช้ HS256 กับ public key
		jwt.WithValidMethods([]string{"ES256", "RS256"}),
		jwt.WithAudience(supabaseAudience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(10 * time.Second),
	}
	// issuer ของ Supabase คือ URL ของ JWKS ที่ตัดส่วนท้ายออก
	if issuer, ok := strings.CutSuffix(jwksURL, jwksSuffix); ok {
		opts = append(opts, jwt.WithIssuer(issuer))
	}
	return &Supabase{keys: keys, parser: jwt.NewParser(opts...)}, nil
}

// supabaseClaims คือ claim ที่ใช้จาก JWT ของ Supabase
type supabaseClaims struct {
	jwt.RegisteredClaims
	Email string `json:"email"`
}

// Authenticate ตรวจลายเซ็น, exp, aud, iss แล้วคืน user ID (claim sub)
func (s *Supabase) Authenticate(ctx context.Context, token string) (string, error) {
	id, err := s.Identify(ctx, token)
	return id.UserID, err
}

// Identify เหมือน Authenticate แต่คืนอีเมลของบัญชีด้วย (claim email ที่ Supabase ลงลายเซ็นรับรอง)
func (s *Supabase) Identify(_ context.Context, token string) (Identity, error) {
	claims := supabaseClaims{}
	if _, err := s.parser.ParseWithClaims(token, &claims, s.keys.Keyfunc); err != nil {
		return Identity{}, ErrInvalidToken // ไม่ส่งรายละเอียดกลับ และไม่ log token
	}
	if claims.Subject == "" || len(claims.Subject) > 64 || strings.HasPrefix(claims.Subject, guestPrefix) {
		return Identity{}, ErrInvalidToken
	}
	email := strings.TrimSpace(claims.Email)
	if len(email) > 254 {
		email = ""
	}
	return Identity{UserID: claims.Subject, Email: email}, nil
}

// Multi รวมตัวตรวจของ guest กับของผู้ใช้ที่ login
// token ที่ขึ้นต้นด้วย "guest_" ไปที่ Guest ที่เหลือไปที่ User
// ตัวไหนเป็น nil แปลว่าปิดการใช้งานแบบนั้น
type Multi struct {
	Guest Authenticator
	User  Authenticator
}

// Authenticate เลือกตัวตรวจตามรูปแบบ token
func (m Multi) Authenticate(ctx context.Context, token string) (string, error) {
	target := m.User
	if strings.HasPrefix(token, guestPrefix) {
		target = m.Guest
	}
	if target == nil {
		return "", ErrInvalidToken
	}
	return target.Authenticate(ctx, token)
}

// Identify เลือกตัวตรวจตามรูปแบบ token แล้วคืนตัวตน (guest ไม่มีอีเมล)
func (m Multi) Identify(ctx context.Context, token string) (Identity, error) {
	target := m.User
	if strings.HasPrefix(token, guestPrefix) {
		target = m.Guest
	}
	if target == nil {
		return Identity{}, ErrInvalidToken
	}
	return Identify(ctx, target, token)
}
