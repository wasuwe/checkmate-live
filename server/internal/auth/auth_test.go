package auth

import (
	"context"
	"errors"
	"testing"
)

func TestGuestRoundTrip(t *testing.T) {
	g, err := NewGuest(nil)
	if err != nil {
		t.Fatal(err)
	}
	userID, token, err := g.Issue()
	if err != nil {
		t.Fatal(err)
	}
	got, err := g.Authenticate(context.Background(), token)
	if err != nil || got != userID {
		t.Fatalf("Authenticate = %q, %v; want %q", got, err, userID)
	}
}

func TestGuestRejectsBadTokens(t *testing.T) {
	g, _ := NewGuest([]byte("secret-a"))
	other, _ := NewGuest([]byte("secret-b"))
	userID, token, _ := g.Issue()
	_, foreign, _ := other.Issue()

	bad := map[string]string{
		"empty":          "",
		"no signature":   userID,
		"empty sig":      userID + ".",
		"wrong sig":      userID + ".deadbeef",
		"tampered id":    "guest_000000000000000000000000" + token[len(userID):],
		"other secret":   foreign,
		"not a guest id": "admin." + token[len(userID)+1:],
	}
	for name, tok := range bad {
		if _, err := g.Authenticate(context.Background(), tok); !errors.Is(err, ErrInvalidToken) {
			t.Errorf("%s: err = %v, want ErrInvalidToken", name, err)
		}
	}
}

func TestGuestIDsAreUnique(t *testing.T) {
	g, _ := NewGuest(nil)
	a, _, _ := g.Issue()
	b, _, _ := g.Issue()
	if a == b {
		t.Fatalf("two guests got the same id %q", a)
	}
}
