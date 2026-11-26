package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/wasuwe/checkmate-live/server/internal/profile"
)

// Profiles เก็บโปรไฟล์ในตาราง profiles ใช้เป็น profile.Store
type Profiles struct {
	s *Store
}

// Profiles คืนที่เก็บโปรไฟล์ที่ใช้การเชื่อมต่อเดียวกับ Store
func (s *Store) Profiles() *Profiles {
	return &Profiles{s: s}
}

var _ profile.Store = (*Profiles)(nil)

// errNotAccount คือ user ID ที่ไม่ใช่ uuid ของบัญชี (เช่น guest) ซึ่งมีโปรไฟล์ไม่ได้
var errNotAccount = errors.New("user is not an account")

func (p *Profiles) Get(ctx context.Context, userID string) (profile.Profile, error) {
	id := accountID(userID)
	if !id.Valid {
		return profile.Profile{}, nil
	}
	var out profile.Profile
	err := p.s.pool.QueryRow(ctx,
		"select display_name, coalesce(avatar_id, '') from profiles where user_id = $1", id,
	).Scan(&out.Name, &out.AvatarID)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile.Profile{}, nil // ยังไม่เคยตั้งค่าอะไร
	}
	return out, err
}

func (p *Profiles) SetName(ctx context.Context, userID, name string) (profile.Profile, error) {
	return p.write(ctx, userID, `
		insert into profiles (user_id, display_name) values ($1, $2)
		on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
		returning display_name, coalesce(avatar_id, '')`, name)
}

func (p *Profiles) SetAvatar(ctx context.Context, userID, avatarID string, a profile.Avatar) (profile.Profile, error) {
	return p.write(ctx, userID, `
		insert into profiles (user_id, avatar_id, avatar, avatar_type) values ($1, $2, $3, $4)
		on conflict (user_id) do update
		set avatar_id = excluded.avatar_id, avatar = excluded.avatar, avatar_type = excluded.avatar_type, updated_at = now()
		returning display_name, coalesce(avatar_id, '')`, avatarID, a.Data, a.ContentType)
}

func (p *Profiles) DeleteAvatar(ctx context.Context, userID string) (profile.Profile, error) {
	out, err := p.write(ctx, userID, `
		update profiles set avatar_id = null, avatar = null, avatar_type = null, updated_at = now()
		where user_id = $1
		returning display_name, coalesce(avatar_id, '')`)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile.Profile{}, nil // ไม่มีโปรไฟล์ = ไม่มีรูปให้ลบ
	}
	return out, err
}

func (p *Profiles) write(ctx context.Context, userID, sql string, args ...any) (profile.Profile, error) {
	id := accountID(userID)
	if !id.Valid {
		return profile.Profile{}, fmt.Errorf("%w: %q", errNotAccount, userID)
	}
	var out profile.Profile
	err := p.s.pool.QueryRow(ctx, sql, append([]any{id}, args...)...).Scan(&out.Name, &out.AvatarID)
	return out, err
}

func (p *Profiles) Avatar(ctx context.Context, avatarID string) (profile.Avatar, error) {
	var a profile.Avatar
	err := p.s.pool.QueryRow(ctx,
		"select avatar_type, avatar from profiles where avatar_id = $1", avatarID,
	).Scan(&a.ContentType, &a.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return profile.Avatar{}, profile.ErrNotFound
	}
	return a, err
}
