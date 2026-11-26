// Package store เก็บห้องและเกมลง PostgreSQL (Supabase) ผ่าน pgx
// ทุก query ใช้ parameter ($1, $2, ...) ไม่มีการต่อ string จากข้อมูลผู้ใช้
package store

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// Store คือการเชื่อมต่อกับฐานข้อมูล
type Store struct {
	pool *pgxpool.Pool
}

// Open เชื่อมต่อฐานข้อมูลและตรวจว่าใช้งานได้
// searchPath ใช้ใน test เพื่อแยก schema ปกติให้เป็นค่าว่าง
func Open(ctx context.Context, databaseURL, searchPath string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		// ข้อความของ pgx ตัดรหัสผ่านออกให้แล้ว
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	// ระบบมีเซิร์ฟเวอร์เดียวและเขียนไม่ถี่ ใช้ connection น้อย ๆ ก็พอ และไม่กินโควตาของ pooler
	cfg.MaxConns = 4
	cfg.MaxConnIdleTime = 5 * time.Minute
	if searchPath != "" {
		cfg.ConnConfig.RuntimeParams["search_path"] = searchPath
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close ปิดการเชื่อมต่อทั้งหมด
func (s *Store) Close() {
	s.pool.Close()
}

// upsertRoom บันทึกสถานะล่าสุดของห้อง
func (s *Store) upsertRoom(ctx context.Context, snap hub.RoomSnapshot) error {
	data, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		insert into rooms (id, status, created_by, time_control, snapshot)
		values ($1, $2, $3, $4, $5)
		on conflict (id) do update
		set status = excluded.status, snapshot = excluded.snapshot, updated_at = now()`,
		snap.ID, string(snap.Status), snap.CreatedBy, snap.TimeControl, data)
	return err
}

func (s *Store) deleteRoom(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "delete from rooms where id = $1", id)
	return err
}

// insertGame บันทึกเกมที่จบแล้ว เรียกซ้ำได้ (เช่น ตอนลองใหม่หลังเขียนไม่สำเร็จ) โดยไม่เกิดแถวซ้ำ
func (s *Store) insertGame(ctx context.Context, g hub.GameRecord) error {
	_, err := s.pool.Exec(ctx, `
		insert into games (room_id, white_id, black_id, pgn, result, reason, time_control, started_at, ended_at)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		on conflict (room_id) do nothing`,
		g.RoomID, accountID(g.WhiteID), accountID(g.BlackID), g.PGN, g.Result, g.Reason, g.TimeControl, g.StartedAt, g.EndedAt)
	return err
}

// accountID แปลง user ID เป็น uuid ของบัญชี Supabase
// guest (และค่าอื่นที่ไม่ใช่ uuid) ได้ NULL เพราะไม่มีบัญชีให้อ้างถึง
func accountID(userID string) pgtype.UUID {
	var id pgtype.UUID
	if err := id.Scan(userID); err != nil {
		return pgtype.UUID{}
	}
	return id
}

// LoadActiveRooms คืนห้องที่ยังไม่จบ สำหรับกู้คืนตอนเซิร์ฟเวอร์เริ่ม
// และลบห้องที่จบแล้วซึ่งค้างมาจากการทำงานรอบก่อน (เกมของห้องเหล่านั้นอยู่ในตาราง games แล้ว)
func (s *Store) LoadActiveRooms(ctx context.Context) ([]hub.RoomSnapshot, error) {
	if _, err := s.pool.Exec(ctx, "delete from rooms where status = 'finished'"); err != nil {
		return nil, fmt.Errorf("clean finished rooms: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		select id, status, created_by, time_control, snapshot
		from rooms
		where status in ('waiting', 'playing')
		order by created_at`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (hub.RoomSnapshot, error) {
		var (
			snap   hub.RoomSnapshot
			status string
			data   []byte
		)
		if err := row.Scan(&snap.ID, &status, &snap.CreatedBy, &snap.TimeControl, &data); err != nil {
			return snap, err
		}
		id, createdBy, tc := snap.ID, snap.CreatedBy, snap.TimeControl
		if err := json.Unmarshal(data, &snap); err != nil {
			return snap, fmt.Errorf("room %s: %w", id, err)
		}
		snap.ID, snap.CreatedBy, snap.TimeControl, snap.Status = id, createdBy, tc, hub.Status(status)
		return snap, nil
	})
}
