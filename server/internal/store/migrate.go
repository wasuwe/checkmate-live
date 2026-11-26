package store

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// migrationLock คือเลขของ advisory lock กันสองเซิร์ฟเวอร์รัน migration พร้อมกัน
const migrationLock = 7_203_114_501

// Migrate รันไฟล์ใน migrations/ ที่ยังไม่เคยรัน ตามลำดับชื่อไฟล์
// แต่ละไฟล์รันใน transaction เดียวกับการจดบันทึก จึงไม่มีสถานะค้างครึ่งทาง
func (s *Store) Migrate(ctx context.Context) error {
	names, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)

	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "select pg_advisory_lock($1)", migrationLock); err != nil {
		return fmt.Errorf("lock migrations: %w", err)
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), "select pg_advisory_unlock($1)", migrationLock)
	}()

	if _, err := conn.Exec(ctx, `create table if not exists schema_migrations (
		name       text primary key,
		applied_at timestamptz not null default now()
	)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	// ตารางนี้ก็ต้องปิดจากฝั่งเว็บเช่นกัน
	if _, err := conn.Exec(ctx, "alter table schema_migrations enable row level security"); err != nil {
		return fmt.Errorf("protect schema_migrations: %w", err)
	}

	for _, name := range names {
		var done bool
		if err := conn.QueryRow(ctx, "select exists (select 1 from schema_migrations where name = $1)", name).Scan(&done); err != nil {
			return fmt.Errorf("check %s: %w", name, err)
		}
		if done {
			continue
		}
		sql, err := migrationFiles.ReadFile(name)
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			// ไฟล์มีหลายคำสั่ง จึงใช้ simple protocol
			if _, err := tx.Conn().PgConn().Exec(ctx, string(sql)).ReadAll(); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, "insert into schema_migrations (name) values ($1)", name)
			return err
		})
		if err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
	}
	return nil
}
