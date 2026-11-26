package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/wasuwe/checkmate-live/server/internal/content"
)

// Content เก็บเนื้อหาที่ admin แก้ได้ ในตาราง site_content และ content_images ใช้เป็น content.Store
type Content struct {
	s *Store
}

// Content คืนที่เก็บเนื้อหาที่ใช้การเชื่อมต่อเดียวกับ Store
func (s *Store) Content() *Content {
	return &Content{s: s}
}

var _ content.Store = (*Content)(nil)

const creditsKey = "credits"

func (c *Content) Credits(ctx context.Context) (*content.Credits, error) {
	var data []byte
	err := c.s.pool.QueryRow(ctx, "select data from site_content where key = $1", creditsKey).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil // ยังไม่เคยบันทึก
	}
	if err != nil {
		return nil, err
	}
	var out content.Credits
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	// ตรวจซ้ำตอนอ่าน: ถ้าแถวในฐานข้อมูลถูกแก้ด้วยมือจนผิดรูป จะไม่ถูกส่งออกไปที่หน้าเว็บ
	if err := out.Clean(); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Content) SaveCredits(ctx context.Context, credits content.Credits, by string) error {
	data, err := json.Marshal(credits)
	if err != nil {
		return err
	}
	_, err = c.s.pool.Exec(ctx, `
		insert into site_content (key, data, updated_by) values ($1, $2, $3)
		on conflict (key) do update
		set data = excluded.data, updated_by = excluded.updated_by, updated_at = now()`,
		creditsKey, data, by)
	return err
}

func (c *Content) SaveImage(ctx context.Context, id string, img content.Image, by string) error {
	_, err := c.s.pool.Exec(ctx,
		"insert into content_images (id, data, content_type, uploaded_by) values ($1, $2, $3, $4)",
		id, img.Data, img.ContentType, by)
	return err
}

func (c *Content) Image(ctx context.Context, id string) (content.Image, error) {
	var img content.Image
	err := c.s.pool.QueryRow(ctx,
		"select content_type, data from content_images where id = $1", id,
	).Scan(&img.ContentType, &img.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return content.Image{}, content.ErrNotFound
	}
	return img, err
}
