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

func (c *Content) InitCredits(ctx context.Context, credits content.Credits, by string) error {
	data, err := json.Marshal(credits)
	if err != nil {
		return err
	}
	tag, err := c.s.pool.Exec(ctx, `
		insert into site_content (key, data, updated_by) values ($1, $2, $3)
		on conflict (key) do nothing`,
		creditsKey, data, by)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return content.ErrExists
	}
	return nil
}

// UpdateCredits แก้ข้อมูลภายใน transaction เดียว โดยล็อกแถวไว้ตั้งแต่อ่านจนเขียน (select ... for update)
// คำขอแก้ไขที่มาพร้อมกันจึงถูกทำทีละคำขอ และแต่ละคำขอเห็นผลของคำขอก่อนหน้าเสมอ
func (c *Content) UpdateCredits(ctx context.Context, by string, fn func(*content.Credits) error) (*content.Credits, error) {
	tx, err := c.s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // ไม่มีผลถ้า commit ไปแล้ว

	var data []byte
	err = tx.QueryRow(ctx, "select data from site_content where key = $1 for update", creditsKey).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, content.ErrNoCredits
	}
	if err != nil {
		return nil, err
	}
	var before content.Credits
	if err := json.Unmarshal(data, &before); err != nil {
		return nil, err
	}
	next := before.Clone()
	if err := fn(&next); err != nil {
		return nil, err
	}
	data, err = json.Marshal(next)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		"update site_content set data = $2, updated_by = $3, updated_at = now() where key = $1",
		creditsKey, data, by); err != nil {
		return nil, err
	}
	// รูปที่ข้อมูลเลิกใช้ ลบใน transaction เดียวกัน: ถ้าบันทึกไม่สำเร็จ รูปก็ยังอยู่
	if unused := content.UnusedImages(&before, &next); len(unused) > 0 {
		if _, err := tx.Exec(ctx, "delete from content_images where id = any($1)", unused); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &next, nil
}

func (c *Content) DeleteImage(ctx context.Context, id string) error {
	_, err := c.s.pool.Exec(ctx, "delete from content_images where id = $1", id)
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
