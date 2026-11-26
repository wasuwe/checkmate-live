package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io/fs"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/wasuwe/checkmate-live/server/internal/content"
	"github.com/wasuwe/checkmate-live/server/internal/envfile"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
)

// test ในไฟล์นี้ต่อฐานข้อมูลจริง และถูกข้ามถ้าไม่มี DATABASE_URL (เช่นใน CI)
// ทุก test ทำงานใน schema ชั่วคราวของตัวเอง จึงไม่แตะตารางจริงใน public
func openTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	_ = envfile.Load("../../.env")
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is not set; skipping database integration test")
	}

	raw := make([]byte, 6)
	if _, err := rand.Read(raw); err != nil {
		t.Fatal(err)
	}
	schema := "cmtest_" + hex.EncodeToString(raw)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	admin, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	// ชื่อ schema มาจากเลขสุ่มฐานสิบหกที่สร้างเอง จึงต่อ string ได้ปลอดภัย
	if _, err := admin.Exec(ctx, "create schema "+schema); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if _, err := admin.Exec(ctx, "drop schema "+schema+" cascade"); err != nil {
			t.Errorf("drop test schema %s: %v", schema, err)
		}
		_ = admin.Close(ctx)
	})

	s, err := Open(ctx, url, schema)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(s.Close)
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return s, schema
}

func TestIntegrationMigrateIsRepeatable(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	var n int
	if err := s.pool.QueryRow(ctx, "select count(*) from schema_migrations").Scan(&n); err != nil {
		t.Fatal(err)
	}
	files, err := fs.Glob(migrationFiles, "migrations/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if n != len(files) {
		t.Fatalf("schema_migrations has %d rows, want %d (one per file)", n, len(files))
	}
}

func TestIntegrationRoomsRoundTrip(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	started := time.Now().UTC().Truncate(time.Millisecond)

	playing := hub.RoomSnapshot{
		ID: "abcdefghjkmn", Status: hub.StatusPlaying, CreatedBy: "guest_abc", TimeControl: "5+3",
		White: "guest_abc", Black: "3f2b8a1e-7c4d-4e9a-b1f0-2d6c5a9e8b77",
		Moves: []string{"e2e4", "e7e5"}, ClockWhite: 299_000, ClockBlack: 301_500, StartedAt: started,
	}
	waiting := hub.RoomSnapshot{ID: "zzzzzzzzzzzz", Status: hub.StatusWaiting, TimeControl: "10+0", Pending: "guest_abc", ClockWhite: 600_000, ClockBlack: 600_000}
	finished := hub.RoomSnapshot{ID: "yyyyyyyyyyyy", Status: hub.StatusFinished, TimeControl: "10+0"}

	for _, snap := range []hub.RoomSnapshot{playing, waiting, finished} {
		if err := s.upsertRoom(ctx, snap); err != nil {
			t.Fatalf("upsert %s: %v", snap.ID, err)
		}
	}
	// อัปเดตห้องเดิม: ต้องทับแถวเดิม ไม่เกิดแถวใหม่
	playing.Moves = append(playing.Moves, "g1f3")
	playing.ClockWhite = 290_000
	if err := s.upsertRoom(ctx, playing); err != nil {
		t.Fatal(err)
	}

	rooms, err := s.LoadActiveRooms(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(rooms) != 2 {
		t.Fatalf("loaded %d rooms, want 2 (finished rooms are not restored)", len(rooms))
	}
	got := rooms[0]
	if got.ID != playing.ID || got.Status != hub.StatusPlaying || got.CreatedBy != "guest_abc" || got.TimeControl != "5+3" ||
		got.White != playing.White || got.Black != playing.Black || len(got.Moves) != 3 || got.Moves[2] != "g1f3" ||
		got.ClockWhite != 290_000 || got.ClockBlack != 301_500 || !got.StartedAt.Equal(started) {
		t.Fatalf("loaded playing room = %+v", got)
	}
	if rooms[1].ID != waiting.ID || rooms[1].Pending != "guest_abc" || rooms[1].Status != hub.StatusWaiting {
		t.Fatalf("loaded waiting room = %+v", rooms[1])
	}

	// snapshot ที่โหลดมาต้องกู้เป็นห้องได้จริง
	h := hub.New(hub.Config{}, nil)
	defer h.Close()
	for _, snap := range rooms {
		if err := h.RestoreRoom(snap); err != nil {
			t.Fatalf("restore %s: %v", snap.ID, err)
		}
	}

	var finishedLeft int
	if err := s.pool.QueryRow(ctx, "select count(*) from rooms where status = 'finished'").Scan(&finishedLeft); err != nil {
		t.Fatal(err)
	}
	if finishedLeft != 0 {
		t.Fatal("finished rooms were not cleaned up on load")
	}

	if err := s.deleteRoom(ctx, playing.ID); err != nil {
		t.Fatal(err)
	}
	if rooms, _ = s.LoadActiveRooms(ctx); len(rooms) != 1 {
		t.Fatalf("after delete: %d rooms, want 1", len(rooms))
	}
}

func TestIntegrationGames(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Millisecond)

	rec := hub.GameRecord{
		RoomID: "abcdefghjkmn", WhiteID: "guest_aaa", BlackID: "guest_bbb",
		PGN: "1. f3 e5 2. g4 Qh4# 0-1", Result: "0-1", Reason: "checkmate", TimeControl: "10+0",
		StartedAt: now.Add(-time.Minute), EndedAt: now,
	}
	if err := s.insertGame(ctx, rec); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := s.insertGame(ctx, rec); err != nil { // ลองซ้ำหลังเขียนสำเร็จแล้ว
		t.Fatalf("repeated insert: %v", err)
	}

	var (
		count              int
		pgn, result        string
		whiteNull, blkNull bool
		ended              time.Time
	)
	if err := s.pool.QueryRow(ctx, "select count(*) from games").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("%d game rows, want 1 (insert must be idempotent)", count)
	}
	err := s.pool.QueryRow(ctx, "select pgn, result, white_id is null, black_id is null, ended_at from games where room_id = $1", rec.RoomID).
		Scan(&pgn, &result, &whiteNull, &blkNull, &ended)
	if err != nil {
		t.Fatal(err)
	}
	if pgn != rec.PGN || result != "0-1" || !whiteNull || !blkNull || !ended.Equal(now) {
		t.Fatalf("stored game: pgn=%q result=%q whiteNull=%v blackNull=%v ended=%v", pgn, result, whiteNull, blkNull, ended)
	}

	// ค่าที่ไม่อยู่ในรายการต้องถูกฐานข้อมูลปฏิเสธ
	bad := rec
	bad.RoomID, bad.Result = "badresult000", "2-0"
	if err := s.insertGame(ctx, bad); err == nil {
		t.Fatal("invalid result was accepted")
	}
	// เกมหมากรุกไทยที่เสมอเพราะนับศักดิ์ครบ และเกมเดิมที่ไม่ระบุชนิดถือเป็นหมากรุกสากล
	makruk := rec
	makruk.RoomID, makruk.Variant, makruk.Result, makruk.Reason = "makrukroom22", "makruk", "1/2-1/2", "count"
	if err := s.insertGame(ctx, makruk); err != nil {
		t.Fatalf("insert makruk game: %v", err)
	}
	checkers := rec
	checkers.RoomID, checkers.Variant, checkers.Result, checkers.Reason = "checkersrm22", "checkers", "1-0", "wipeout"
	if err := s.insertGame(ctx, checkers); err != nil {
		t.Fatalf("insert checkers game: %v", err)
	}
	checkers.RoomID, checkers.Reason = "checkersrm33", "blocked"
	if err := s.insertGame(ctx, checkers); err != nil {
		t.Fatalf("insert blocked checkers game: %v", err)
	}
	var variants string
	if err := s.pool.QueryRow(ctx, "select string_agg(variant, ',' order by variant) from games").Scan(&variants); err != nil {
		t.Fatal(err)
	}
	if variants != "checkers,checkers,chess,makruk" {
		t.Fatalf("variants = %q, want checkers,checkers,chess,makruk", variants)
	}
	bad = rec
	bad.RoomID, bad.Variant = "badvariant22", "Not A Game"
	if err := s.insertGame(ctx, bad); err == nil {
		t.Fatal("invalid variant was accepted")
	}
	bad = rec
	bad.RoomID, bad.Reason = "badreason000", "rage_quit"
	if err := s.insertGame(ctx, bad); err == nil {
		t.Fatal("invalid reason was accepted")
	}

	// บัญชีที่ไม่มีอยู่จริงต้องถูกปฏิเสธด้วย foreign key ไม่ใช่บันทึกเป็นผู้เล่นปลอม
	ghost := rec
	ghost.RoomID, ghost.WhiteID = "ghostplayer0", "3f2b8a1e-7c4d-4e9a-b1f0-2d6c5a9e8b77"
	if err := s.insertGame(ctx, ghost); err == nil {
		t.Fatal("game for a non-existent account was accepted")
	}
}

func TestIntegrationSQLInjectionIsInert(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	evil := "'); drop table games; --"

	if err := s.upsertRoom(ctx, hub.RoomSnapshot{ID: "abcdefghjkmn", Status: hub.StatusWaiting, CreatedBy: evil, TimeControl: evil, Pending: evil}); err != nil {
		t.Fatalf("upsert with hostile text: %v", err)
	}
	if err := s.deleteRoom(ctx, evil); err != nil {
		t.Fatalf("delete with hostile id: %v", err)
	}
	rooms, err := s.LoadActiveRooms(ctx)
	if err != nil || len(rooms) != 1 || rooms[0].CreatedBy != evil || rooms[0].Pending != evil {
		t.Fatalf("hostile text was not stored verbatim: %+v, %v", rooms, err)
	}
	var n int
	if err := s.pool.QueryRow(ctx, "select count(*) from games").Scan(&n); err != nil {
		t.Fatalf("games table is gone: %v", err)
	}
	// รหัสห้องที่ไม่ตรงรูปแบบถูกปฏิเสธโดย check constraint
	if err := s.upsertRoom(ctx, hub.RoomSnapshot{ID: evil, Status: hub.StatusWaiting, TimeControl: "10+0"}); err == nil {
		t.Fatal("room with a malformed id was accepted")
	}
}

func TestIntegrationTablesAreClosedToWebRoles(t *testing.T) {
	s, schema := openTestStore(t)
	ctx := context.Background()

	for _, table := range []string{"rooms", "games", "schema_migrations"} {
		var rls bool
		err := s.pool.QueryRow(ctx, `
			select c.relrowsecurity
			from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = $1 and c.relname = $2`, schema, table).Scan(&rls)
		if err != nil {
			t.Fatalf("%s: %v", table, err)
		}
		if !rls {
			t.Errorf("%s: row level security is not enabled", table)
		}

		var policies int
		if err := s.pool.QueryRow(ctx, "select count(*) from pg_policies where schemaname = $1 and tablename = $2", schema, table).Scan(&policies); err != nil {
			t.Fatal(err)
		}
		if policies != 0 {
			t.Errorf("%s: has %d policies, want none (deny by default)", table, policies)
		}
	}

	// role ฝั่งเว็บของ Supabase ต้องไม่มีสิทธิ์ใด ๆ บนตารางข้อมูล
	for _, role := range []string{"anon", "authenticated"} {
		var exists bool
		if err := s.pool.QueryRow(ctx, "select exists (select 1 from pg_roles where rolname = $1)", role).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Logf("role %s does not exist in this database; skipping", role)
			continue
		}
		for _, table := range []string{"rooms", "games", "site_content", "content_images"} {
			for _, priv := range []string{"select", "insert", "update", "delete"} {
				var allowed bool
				err := s.pool.QueryRow(ctx, "select has_table_privilege($1, $2, $3)", role, schema+"."+table, priv).Scan(&allowed)
				if err != nil {
					t.Fatal(err)
				}
				if allowed {
					t.Errorf("role %s can %s %s", role, priv, table)
				}
			}
		}
	}
}

func TestIntegrationProfiles(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	p := s.Profiles()
	const alice, bob = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
	const id1, id2 = "0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210"

	if got, err := p.Get(ctx, alice); err != nil || got != (profile.Profile{}) {
		t.Fatalf("new account = %+v, %v", got, err)
	}
	// guest ไม่มีโปรไฟล์: อ่านได้ค่าว่าง เขียนไม่ได้
	if got, err := p.Get(ctx, "guest_abc"); err != nil || got != (profile.Profile{}) {
		t.Fatalf("guest get = %+v, %v", got, err)
	}
	if _, err := p.SetName(ctx, "guest_abc", "Guest"); err == nil {
		t.Fatal("guest could set a name")
	}

	// ลบรูปของคนที่ยังไม่มีโปรไฟล์ต้องไม่ error
	if got, err := p.DeleteAvatar(ctx, alice); err != nil || got != (profile.Profile{}) {
		t.Fatalf("delete with no profile = %+v, %v", got, err)
	}

	// อัปโหลดรูปก่อนตั้งชื่อก็ได้ และค่าที่ตั้งทีหลังไม่ลบอีกค่า
	if got, err := p.SetAvatar(ctx, alice, id1, profile.Avatar{ContentType: "image/png", Data: []byte("one")}); err != nil || got != (profile.Profile{AvatarID: id1}) {
		t.Fatalf("set avatar = %+v, %v", got, err)
	}
	if got, err := p.SetName(ctx, alice, "น้ำผึ้ง"); err != nil || got != (profile.Profile{Name: "น้ำผึ้ง", AvatarID: id1}) {
		t.Fatalf("set name = %+v, %v", got, err)
	}
	if got, err := p.Get(ctx, alice); err != nil || got != (profile.Profile{Name: "น้ำผึ้ง", AvatarID: id1}) {
		t.Fatalf("get = %+v, %v", got, err)
	}
	if got, _ := p.Get(ctx, bob); got != (profile.Profile{}) {
		t.Fatalf("bob sees %+v", got)
	}

	if a, err := p.Avatar(ctx, id1); err != nil || a.ContentType != "image/png" || string(a.Data) != "one" {
		t.Fatalf("avatar = %+v, %v", a, err)
	}
	// รหัสรูปซ้ำกับของคนอื่นไม่ได้
	if _, err := p.SetAvatar(ctx, bob, id1, profile.Avatar{ContentType: "image/png", Data: []byte("x")}); err == nil {
		t.Fatal("two accounts share one avatar id")
	}
	// ชนิดไฟล์นอกรายการถูกฐานข้อมูลปฏิเสธด้วย
	if _, err := p.SetAvatar(ctx, bob, id2, profile.Avatar{ContentType: "image/svg+xml", Data: []byte("x")}); err == nil {
		t.Fatal("database accepted an svg avatar")
	}

	if got, err := p.SetAvatar(ctx, alice, id2, profile.Avatar{ContentType: "image/jpeg", Data: []byte("two")}); err != nil || got.AvatarID != id2 {
		t.Fatalf("replace avatar = %+v, %v", got, err)
	}
	if _, err := p.Avatar(ctx, id1); !errors.Is(err, profile.ErrNotFound) {
		t.Fatalf("old avatar: %v", err)
	}
	if got, err := p.DeleteAvatar(ctx, alice); err != nil || got != (profile.Profile{Name: "น้ำผึ้ง"}) {
		t.Fatalf("delete avatar = %+v, %v", got, err)
	}
	if _, err := p.Avatar(ctx, id2); !errors.Is(err, profile.ErrNotFound) {
		t.Fatalf("deleted avatar: %v", err)
	}
}

func TestIntegrationChatReports(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Millisecond)
	report := hub.ChatReport{
		RoomID: "abcdefghjkmn", MessageID: 7, Text: "ข้อความหยาบ", SenderID: "guest_aaa",
		ReporterID: "11111111-1111-4111-8111-111111111111", SentAt: now.Add(-time.Minute), ReportedAt: now,
	}

	sink := NewReportSink(s, nil)
	sink.Report(report)
	sink.Report(report) // คนเดิมรายงานข้อความเดิมซ้ำ
	other := report
	other.ReporterID = "guest_bbb"
	sink.Report(other)
	sink.Close() // รอจนเขียนครบ

	var n int
	var message, sender string
	if err := s.pool.QueryRow(ctx, "select count(*), min(message), min(sender_id) from chat_reports").Scan(&n, &message, &sender); err != nil {
		t.Fatal(err)
	}
	if n != 2 || message != "ข้อความหยาบ" || sender != "guest_aaa" {
		t.Fatalf("chat_reports: %d rows, message %q, sender %q; want 2 rows", n, message, sender)
	}
}

func TestIntegrationContent(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	c := s.Content()

	if got, err := c.Credits(ctx); got != nil || err != nil {
		t.Fatalf("credits before any save: %v %v", got, err)
	}
	credits := content.Credits{
		People: []content.Person{{ID: "nok", Name: "Nok", Bg: "#FFB8CC"}},
		Team:   []content.TeamGroup{{Role: "Developer", Bg: "#A9D6F7", IDs: []string{"nok"}}},
		Ocs:    []content.Oc{{ID: "kaimuk", Name: "ไข่มุก", Owner: "nok", Artist: "nok", Color: "#FF8FB1", Pale: "#FFE8EF"}},
	}
	if err := c.SaveCredits(ctx, credits, "admin-1"); err != nil {
		t.Fatal(err)
	}
	credits.Ocs[0].Name = "ผึ้ง"
	if err := c.SaveCredits(ctx, credits, "admin-2"); err != nil { // บันทึกทับ
		t.Fatal(err)
	}
	got, err := c.Credits(ctx)
	if err != nil || got == nil || got.Ocs[0].Name != "ผึ้ง" || got.People[0].ID != "nok" {
		t.Fatalf("stored credits: %+v %v", got, err)
	}
	var rows int
	var by string
	if err := s.pool.QueryRow(ctx, "select count(*), max(updated_by) from site_content").Scan(&rows, &by); err != nil || rows != 1 || by != "admin-2" {
		t.Fatalf("site_content rows=%d by=%q err=%v", rows, by, err)
	}

	// แถวที่ถูกแก้ด้วยมือจนผิดรูปต้องไม่ถูกส่งออกไป
	if _, err := s.pool.Exec(ctx, `update site_content set data = '{"people":[{"id":"x","name":"X","bg":"red"}]}' where key = 'credits'`); err != nil {
		t.Fatal(err)
	}
	if got, err := c.Credits(ctx); err == nil {
		t.Fatalf("tampered credits were returned: %+v", got)
	}

	id := "0123456789abcdef0123456789abcdef"
	if _, err := c.Image(ctx, id); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("missing image: %v", err)
	}
	if err := c.SaveImage(ctx, id, content.Image{ContentType: "image/png", Data: []byte{1, 2, 3}}, "admin-1"); err != nil {
		t.Fatal(err)
	}
	img, err := c.Image(ctx, id)
	if err != nil || img.ContentType != "image/png" || len(img.Data) != 3 {
		t.Fatalf("stored image: %+v %v", img, err)
	}
	// ฐานข้อมูลปฏิเสธชนิดไฟล์และรหัสที่ไม่อยู่ในรูปแบบ
	if err := c.SaveImage(ctx, "fedcba9876543210fedcba9876543210", content.Image{ContentType: "image/svg+xml", Data: []byte{1}}, ""); err == nil {
		t.Fatal("svg content type was accepted")
	}
	if err := c.SaveImage(ctx, "not-an-id", content.Image{ContentType: "image/png", Data: []byte{1}}, ""); err == nil {
		t.Fatal("bad image id was accepted")
	}
}
