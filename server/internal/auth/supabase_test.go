package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testUserID = "3f2b8a1e-7c4d-4e9a-b1f0-2d6c5a9e8b77"

// fakeSupabase จำลอง endpoint JWKS ของ Supabase Auth ด้วยกุญแจที่สร้างใน test
type fakeSupabase struct {
	t      *testing.T
	srv    *httptest.Server
	ecKey  *ecdsa.PrivateKey
	rsaKey *rsa.PrivateKey
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func newFakeSupabase(t *testing.T) *fakeSupabase {
	t.Helper()
	ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	x, y := make([]byte, 32), make([]byte, 32)
	ecKey.X.FillBytes(x)
	ecKey.Y.FillBytes(y)
	jwks := map[string]any{"keys": []map[string]any{
		{"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "ec-1", "x": b64(x), "y": b64(y)},
		{
			"kty": "RSA", "alg": "RS256", "use": "sig", "kid": "rsa-1",
			"n": b64(rsaKey.N.Bytes()), "e": b64(big.NewInt(int64(rsaKey.E)).Bytes()),
		},
	}}

	mux := http.NewServeMux()
	mux.HandleFunc("/auth/v1/.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jwks)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &fakeSupabase{t: t, srv: srv, ecKey: ecKey, rsaKey: rsaKey}
}

func (f *fakeSupabase) jwksURL() string { return f.srv.URL + "/auth/v1/.well-known/jwks.json" }
func (f *fakeSupabase) issuer() string  { return f.srv.URL + "/auth/v1" }

func (f *fakeSupabase) verifier() *Supabase {
	f.t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	f.t.Cleanup(cancel)
	s, err := NewSupabase(ctx, f.jwksURL())
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}

// claims คืน claim ของ token ที่ถูกต้อง ให้ test แก้ทีละจุด
func (f *fakeSupabase) claims() jwt.MapClaims {
	return jwt.MapClaims{
		"sub":  testUserID,
		"aud":  "authenticated",
		"iss":  f.issuer(),
		"role": "authenticated",
		"exp":  time.Now().Add(time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	}
}

func (f *fakeSupabase) sign(method jwt.SigningMethod, kid string, key any, claims jwt.MapClaims) string {
	f.t.Helper()
	tok := jwt.NewWithClaims(method, claims)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}

func (f *fakeSupabase) es256(claims jwt.MapClaims) string {
	return f.sign(jwt.SigningMethodES256, "ec-1", f.ecKey, claims)
}

func TestSupabaseAcceptsValidTokens(t *testing.T) {
	f := newFakeSupabase(t)
	s := f.verifier()

	tokens := map[string]string{
		"ES256": f.es256(f.claims()),
		"RS256": f.sign(jwt.SigningMethodRS256, "rsa-1", f.rsaKey, f.claims()),
	}
	for name, tok := range tokens {
		got, err := s.Authenticate(context.Background(), tok)
		if err != nil || got != testUserID {
			t.Errorf("%s: Authenticate = %q, %v; want %q", name, got, err, testUserID)
		}
	}
}

func TestSupabaseRejectsBadTokens(t *testing.T) {
	f := newFakeSupabase(t)
	s := f.verifier()

	with := func(edit func(jwt.MapClaims)) jwt.MapClaims {
		c := f.claims()
		edit(c)
		return c
	}
	otherKey, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

	// HS256 ที่ใช้ public key เป็น secret: การโจมตีแบบสลับอัลกอริทึม
	pub, _ := json.Marshal(f.ecKey.PublicKey.X)
	valid := f.es256(f.claims())

	bad := map[string]string{
		"empty":           "",
		"garbage":         "not.a.jwt",
		"expired":         f.es256(with(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() })),
		"no exp":          f.es256(with(func(c jwt.MapClaims) { delete(c, "exp") })),
		"wrong audience":  f.es256(with(func(c jwt.MapClaims) { c["aud"] = "anon" })),
		"no audience":     f.es256(with(func(c jwt.MapClaims) { delete(c, "aud") })),
		"wrong issuer":    f.es256(with(func(c jwt.MapClaims) { c["iss"] = "https://evil.example/auth/v1" })),
		"no subject":      f.es256(with(func(c jwt.MapClaims) { delete(c, "sub") })),
		"guest subject":   f.es256(with(func(c jwt.MapClaims) { c["sub"] = "guest_000000000000000000000000" })),
		"wrong key":       f.sign(jwt.SigningMethodES256, "ec-1", otherKey, f.claims()),
		"unknown kid":     f.sign(jwt.SigningMethodES256, "nope", f.ecKey, f.claims()),
		"hs256 confusion": f.sign(jwt.SigningMethodHS256, "ec-1", pub, f.claims()),
		"alg none":        f.sign(jwt.SigningMethodNone, "ec-1", jwt.UnsafeAllowNoneSignatureType, f.claims()),
		"tampered":        valid[:len(valid)-4] + "AAAA",
	}
	for name, tok := range bad {
		if got, err := s.Authenticate(context.Background(), tok); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: Authenticate = %q, %v; want ErrInvalidToken", name, got, err)
		}
	}
}

func TestNewSupabaseRejectsBadURL(t *testing.T) {
	if _, err := NewSupabase(context.Background(), "ftp://example.com/jwks.json"); err == nil {
		t.Fatal("expected an error for a non-http URL")
	}
}

func TestSupabaseStartsWhenJWKSUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	srv.Close() // ไม่มีใครฟังที่ URL นี้แล้ว
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s, err := NewSupabase(ctx, srv.URL+"/auth/v1/.well-known/jwks.json")
	if err != nil {
		t.Fatalf("server must still start when JWKS is unreachable: %v", err)
	}
	if _, err := s.Authenticate(ctx, "a.b.c"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
}

func TestMultiRoutesByTokenShape(t *testing.T) {
	f := newFakeSupabase(t)
	guest, _ := NewGuest(nil)
	guestID, guestToken, _ := guest.Issue()
	userToken := f.es256(f.claims())

	both := Multi{Guest: guest, User: f.verifier()}
	if got, err := both.Authenticate(context.Background(), guestToken); err != nil || got != guestID {
		t.Errorf("guest token: %q, %v", got, err)
	}
	if got, err := both.Authenticate(context.Background(), userToken); err != nil || got != testUserID {
		t.Errorf("user token: %q, %v", got, err)
	}

	usersOnly := Multi{User: f.verifier()}
	if _, err := usersOnly.Authenticate(context.Background(), guestToken); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("guest token with guests disabled: err = %v", err)
	}
	guestsOnly := Multi{Guest: guest}
	if _, err := guestsOnly.Authenticate(context.Background(), userToken); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("user token with login disabled: err = %v", err)
	}
}
