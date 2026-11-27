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
	"github.com/wasuwe/checkmate-live/server/internal/members"
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
		ID: "482915", Status: hub.StatusPlaying, CreatedBy: "guest_abc", TimeControl: "5+3",
		White: "guest_abc", Black: "3f2b8a1e-7c4d-4e9a-b1f0-2d6c5a9e8b77",
		Moves: []string{"e2e4", "e7e5"}, ClockWhite: 299_000, ClockBlack: 301_500, StartedAt: started,
	}
	waiting := hub.RoomSnapshot{ID: "999999", Status: hub.StatusWaiting, TimeControl: "10+0", Pending: "guest_abc", ClockWhite: 600_000, ClockBlack: 600_000}
	finished := hub.RoomSnapshot{ID: "888888", Status: hub.StatusFinished, TimeControl: "10+0"}

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
		RoomID: "482915", WhiteID: "guest_aaa", BlackID: "guest_bbb",
		PGN: "1. f3 e5 2. g4 Qh4# 0-1", Result: "0-1", Reason: "checkmate", TimeControl: "10+0",
		StartedAt: now.Add(-time.Minute), EndedAt: now,
	}
	if err := s.insertGame(ctx, rec); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := s.insertGame(ctx, rec); err != nil { // ลองซ้ำหลังเขียนสำเร็จแล้ว
		t.Fatalf("repeated insert: %v", err)
	}
	// รหัสห้อง 6 หลักถูกนำกลับมาใช้ใหม่ได้: เกมของห้องใหม่ที่ได้รหัสเดิมต้องถูกบันทึกเป็นอีกแถว
	later := rec
	later.StartedAt, later.EndedAt, later.Result = now.Add(time.Hour), now.Add(2*time.Hour), "1-0"
	if err := s.insertGame(ctx, later); err != nil {
		t.Fatalf("insert a later game with a reused room code: %v", err)
	}
	var sameRoom int
	if err := s.pool.QueryRow(ctx, "select count(*) from games where room_id = $1", rec.RoomID).Scan(&sameRoom); err != nil || sameRoom != 2 {
		t.Fatalf("%d games stored for the reused room code (err %v), want 2", sameRoom, err)
	}
	if _, err := s.pool.Exec(ctx, "delete from games where room_id = $1 and started_at = $2", later.RoomID, later.StartedAt); err != nil {
		t.Fatal(err)
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

	if err := s.upsertRoom(ctx, hub.RoomSnapshot{ID: "482915", Status: hub.StatusWaiting, CreatedBy: evil, TimeControl: evil, Pending: evil}); err != nil {
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
		RoomID: "482915", MessageID: 7, Text: "ข้อความหยาบ", SenderID: "guest_aaa",
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
	const imgA, imgB = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

	if got, err := c.Credits(ctx); got != nil || err != nil {
		t.Fatalf("credits before any save: %v %v", got, err)
	}
	if _, err := c.UpdateCredits(ctx, "admin-1", func(*content.Credits) error { return nil }); !errors.Is(err, content.ErrNoCredits) {
		t.Fatalf("update before init: %v", err)
	}
	credits := content.Credits{
		People: []content.Person{{ID: "nok", Name: "Nok", Bg: "#FFB8CC"}},
		Team:   []content.TeamGroup{{Role: "Developer", Bg: "#A9D6F7", IDs: []string{"nok"}}},
		Ocs:    []content.Oc{{ID: "kaimuk", Name: "ไข่มุก", Owner: "nok", Artist: "nok", Color: "#FF8FB1", Pale: "#FFE8EF"}},
	}
	if err := credits.Seed(); err != nil {
		t.Fatal(err)
	}
	if err := c.InitCredits(ctx, credits, "admin-1"); err != nil {
		t.Fatal(err)
	}
	if err := c.InitCredits(ctx, credits, "admin-2"); !errors.Is(err, content.ErrExists) {
		t.Fatalf("second init: %v, want ErrExists", err)
	}

	// แก้หนึ่งรายการ: เลขรุ่นเพิ่ม และจำไว้ว่าใครแก้
	saveName := func(by string, rev int, name string) error {
		_, err := c.UpdateCredits(ctx, by, func(cr *content.Credits) error {
			o := cr.Ocs[0]
			o.Name = name
			return cr.Apply(content.Op{Op: content.OpSave, Kind: content.KindOcs, ID: "kaimuk", Rev: rev, Oc: &o})
		})
		return err
	}
	if err := saveName("admin-2", 1, "ผึ้ง"); err != nil {
		t.Fatal(err)
	}
	// อีกคนที่ยังถือรุ่น 1 บันทึกทับไม่ได้ และข้อมูลไม่เปลี่ยน
	if err := saveName("admin-3", 1, "ทับ"); !errors.Is(err, content.ErrConflict) {
		t.Fatalf("stale save: %v, want ErrConflict", err)
	}
	got, err := c.Credits(ctx)
	if err != nil || got.Ocs[0].Name != "ผึ้ง" || got.Ocs[0].Rev != 2 {
		t.Fatalf("stored credits: %+v %v", got, err)
	}
	var rows int
	var by string
	if err := s.pool.QueryRow(ctx, "select count(*), max(updated_by) from site_content").Scan(&rows, &by); err != nil || rows != 1 || by != "admin-2" {
		t.Fatalf("site_content rows=%d by=%q err=%v", rows, by, err)
	}

	// รูป: ตั้ง เปลี่ยน แล้วลบตัวละคร รูปที่เลิกใช้ต้องหายจากตารางทุกครั้ง
	countImages := func() (n int) {
		if err := s.pool.QueryRow(ctx, "select count(*) from content_images").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	setImage := func(rev int, path string) error {
		_, err := c.UpdateCredits(ctx, "admin-1", func(cr *content.Credits) error { return cr.SetOcImage("kaimuk", rev, path) })
		return err
	}
	for _, id := range []string{imgA, imgB} {
		if err := c.SaveImage(ctx, id, content.Image{ContentType: "image/png", Data: []byte{1, 2, 3}}, "admin-1"); err != nil {
			t.Fatal(err)
		}
	}
	if err := setImage(2, content.ImagePath(imgA)); err != nil {
		t.Fatal(err)
	}
	if err := setImage(3, content.ImagePath(imgB)); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Image(ctx, imgA); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("the replaced image is still in the table: %v", err)
	}
	if img, err := c.Image(ctx, imgB); err != nil || img.ContentType != "image/png" || len(img.Data) != 3 {
		t.Fatalf("current image: %+v %v", img, err)
	}
	// การแก้ที่ถูกปฏิเสธต้องไม่ลบรูป (อยู่ใน transaction เดียวกัน)
	if err := setImage(1, ""); !errors.Is(err, content.ErrConflict) || countImages() != 1 {
		t.Fatalf("refused change: err=%v images=%d", err, countImages())
	}
	if _, err := c.UpdateCredits(ctx, "admin-1", func(cr *content.Credits) error {
		return cr.Apply(content.Op{Op: content.OpDelete, Kind: content.KindOcs, ID: "kaimuk", Rev: 4})
	}); err != nil {
		t.Fatal(err)
	}
	if n := countImages(); n != 0 {
		t.Fatalf("%d images left after deleting the character", n)
	}

	// แถวที่ถูกแก้ด้วยมือจนผิดรูปต้องไม่ถูกส่งออกไป
	if _, err := s.pool.Exec(ctx, `update site_content set data = '{"people":[{"id":"x","rev":1,"name":"X","bg":"red"}]}' where key = 'credits'`); err != nil {
		t.Fatal(err)
	}
	if got, err := c.Credits(ctx); err == nil {
		t.Fatalf("tampered credits were returned: %+v", got)
	}

	// ฐานข้อมูลปฏิเสธชนิดไฟล์และรหัสที่ไม่อยู่ในรูปแบบ
	if err := c.SaveImage(ctx, "fedcba9876543210fedcba9876543210", content.Image{ContentType: "image/svg+xml", Data: []byte{1}}, ""); err == nil {
		t.Fatal("svg content type was accepted")
	}
	if err := c.SaveImage(ctx, "not-an-id", content.Image{ContentType: "image/png", Data: []byte{1}}, ""); err == nil {
		t.Fatal("bad image id was accepted")
	}
}

func TestIntegrationPieceStyles(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	c := s.Content()
	const imgA, imgB = "cccccccccccccccccccccccccccccccc", "dddddddddddddddddddddddddddddddd"

	// ยังไม่มีข้อมูล = รายการว่าง ไม่ใช่ error
	if got, err := c.PieceStyles(ctx); err != nil || got == nil || len(got.Styles) != 0 {
		t.Fatalf("styles before any save: %v %v", got, err)
	}
	got, err := c.UpdatePieceStyles(ctx, "artist-1", func(p *content.PieceStyles) error { return p.Create("ชุดแรก") })
	if err != nil || len(got.Styles) != 1 || got.Styles[0].Rev != 1 {
		t.Fatalf("create: %v %v", got, err)
	}
	id := got.Styles[0].ID
	img := content.Image{ContentType: "image/png", Data: []byte("x")}
	for _, imageID := range []string{imgA, imgB} {
		if err := c.SaveImage(ctx, imageID, img, "artist-1"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := c.UpdatePieceStyles(ctx, "artist-1", func(p *content.PieceStyles) error {
		return p.SetImage(id, 1, "wK", content.ImagePath(imgA))
	}); err != nil {
		t.Fatal(err)
	}
	// เปลี่ยนรูป: รูปเก่าถูกลบใน transaction เดียวกัน
	if _, err := c.UpdatePieceStyles(ctx, "artist-1", func(p *content.PieceStyles) error {
		return p.SetImage(id, 2, "wK", content.ImagePath(imgB))
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Image(ctx, imgA); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("the replaced image is still stored: %v", err)
	}
	// fn ที่คืน error ไม่บันทึกอะไร
	if _, err := c.UpdatePieceStyles(ctx, "artist-1", func(p *content.PieceStyles) error { return p.Rename(id, 1, "stale") }); !errors.Is(err, content.ErrConflict) {
		t.Fatalf("stale rename: %v", err)
	}
	read, err := c.PieceStyles(ctx)
	if err != nil || read.Styles[0].Name != "ชุดแรก" || read.Styles[0].Images["wK"] != content.ImagePath(imgB) || read.Styles[0].Rev != 3 {
		t.Fatalf("read back: %+v %v", read, err)
	}
	// ลบรูปแบบ: รูปที่เหลือถูกลบด้วย และไม่กระทบข้อมูลเครดิต
	if _, err := c.UpdatePieceStyles(ctx, "artist-1", func(p *content.PieceStyles) error { return p.Delete(id, 3) }); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Image(ctx, imgB); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("the deleted style's image is still stored: %v", err)
	}
}

func TestIntegrationMembers(t *testing.T) {
	s, _ := openTestStore(t)
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := s.pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	// เฉพาะใน schema ทดสอบ: ใช้ตารางบัญชีจำลองแทน auth.users และถอดการผูกกับบัญชีจริงออกจาก games
	// เพื่อให้ใส่เกมของบัญชีสมมุติได้ โดยไม่แตะตารางของ Supabase Auth
	exec("alter table games drop constraint games_white_id_fkey, drop constraint games_black_id_fkey")
	exec("create table test_users (id uuid primary key, email text, created_at timestamptz, last_sign_in_at timestamptz)")
	m := s.Members()
	m.users = "test_users"

	const (
		alice = "11111111-1111-4111-8111-111111111111"
		bob   = "22222222-2222-4222-8222-222222222222"
		carol = "33333333-3333-4333-8333-333333333333"
	)
	day := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	signIn := day.Add(72 * time.Hour)
	exec("insert into test_users values ($1, 'alice@example.com', $2, $3)", alice, day, signIn)
	exec("insert into test_users values ($1, 'bob@example.com', $2, null)", bob, day.Add(24*time.Hour))
	exec("insert into test_users values ($1, 'carol@example.com', $2, null)", carol, day.Add(48*time.Hour))
	if _, err := s.Profiles().SetName(ctx, alice, "Alice"); err != nil {
		t.Fatal(err)
	}

	game := func(room, white, black, variant, result, reason string, start time.Time, length time.Duration) {
		t.Helper()
		rec := hub.GameRecord{
			RoomID: room, WhiteID: white, BlackID: black, PGN: "*", Result: result, Reason: reason,
			TimeControl: "10+0", Variant: variant, StartedAt: start, EndedAt: start.Add(length),
		}
		if err := s.insertGame(ctx, rec); err != nil {
			t.Fatalf("insert game %s: %v", room, err)
		}
	}
	play := day.Add(100 * time.Hour)
	game("AAAAA2", alice, bob, "chess", "1-0", "checkmate", play, 10*time.Minute)                     // alice ชนะ
	game("AAAAA3", bob, alice, "chess", "1/2-1/2", "draw", play.Add(time.Hour), 5*time.Minute)        // เสมอ
	game("AAAAA4", alice, "guest_x", "makruk", "0-1", "resign", play.Add(2*time.Hour), 2*time.Minute) // alice แพ้ผู้เล่นรับเชิญ
	game("AAAAA5", "guest_x", "guest_y", "checkers", "1-0", "wipeout", play, time.Minute)             // ไม่มีสมาชิก ไม่ถูกนับ

	list, err := m.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 || list[0].ID != carol || list[1].ID != bob || list[2].ID != alice {
		t.Fatalf("members, newest first: %+v", list)
	}
	a, b, c := list[2], list[1], list[0]
	if a.Email != "alice@example.com" || a.Name != "Alice" || !a.JoinedAt.Equal(day) || a.LastSignIn == nil || !a.LastSignIn.Equal(signIn) {
		t.Fatalf("alice's account: %+v", a)
	}
	if a.Games != 3 || a.Wins != 1 || a.Losses != 1 || a.Draws != 1 || a.Seconds != 17*60 ||
		a.LastPlayed == nil || !a.LastPlayed.Equal(play.Add(2*time.Hour+2*time.Minute)) {
		t.Fatalf("alice's totals: %+v", a.Stats)
	}
	if b.Games != 2 || b.Wins != 0 || b.Losses != 1 || b.Draws != 1 || b.Seconds != 15*60 || b.Name != "" || b.LastSignIn != nil {
		t.Fatalf("bob: %+v", b)
	}
	if c.Games != 0 || c.Seconds != 0 || c.LastPlayed != nil {
		t.Fatalf("carol never played: %+v", c.Stats)
	}

	d, err := m.Get(ctx, alice)
	if err != nil {
		t.Fatal(err)
	}
	if d.ID != alice || d.Games != 3 || d.Name != "Alice" {
		t.Fatalf("detail header: %+v", d.Member)
	}
	if len(d.ByGame) != 2 || d.ByGame[0].Game != "chess" || d.ByGame[0].Games != 2 || d.ByGame[0].Wins != 1 || d.ByGame[0].Draws != 1 ||
		d.ByGame[0].Seconds != 15*60 || d.ByGame[1].Game != "makruk" || d.ByGame[1].Losses != 1 || d.ByGame[1].Seconds != 2*60 {
		t.Fatalf("by game: %+v", d.ByGame)
	}
	if len(d.Opponents) != 2 || d.Opponents[0].ID != bob || d.Opponents[0].Email != "bob@example.com" || d.Opponents[0].Games != 2 ||
		d.Opponents[0].Wins != 1 || d.Opponents[0].Draws != 1 || d.Opponents[1].ID != "" || d.Opponents[1].Games != 1 || d.Opponents[1].Losses != 1 {
		t.Fatalf("opponents: %+v", d.Opponents)
	}
	if len(d.Recent) != 3 {
		t.Fatalf("recent games: %+v", d.Recent)
	}
	last, mid, first := d.Recent[0], d.Recent[1], d.Recent[2]
	if last.Game != "makruk" || last.Color != "w" || last.Outcome != "loss" || last.Reason != "resign" || last.OpponentID != "" || last.Seconds != 120 || last.TimeControl != "10+0" {
		t.Fatalf("latest game: %+v", last)
	}
	if mid.Color != "b" || mid.Outcome != "draw" || mid.OpponentID != bob || mid.OpponentEmail != "bob@example.com" {
		t.Fatalf("second game: %+v", mid)
	}
	if first.Outcome != "win" || first.Color != "w" || !first.StartedAt.Equal(play) || first.Seconds != 600 {
		t.Fatalf("first game: %+v", first)
	}

	// มุมของ bob: ผลกลับด้าน และชื่อคู่แข่งมาจากโปรไฟล์
	bd, err := m.Get(ctx, bob)
	if err != nil {
		t.Fatal(err)
	}
	if len(bd.Opponents) != 1 || bd.Opponents[0].Name != "Alice" || bd.Opponents[0].Losses != 1 || bd.Opponents[0].Wins != 0 || bd.Recent[1].Outcome != "loss" || bd.Recent[1].Color != "b" {
		t.Fatalf("bob's view: %+v / %+v", bd.Opponents, bd.Recent)
	}

	// คนที่ไม่เคยเล่น: รายการว่าง ไม่ใช่ error
	cd, err := m.Get(ctx, carol)
	if err != nil || len(cd.ByGame) != 0 || len(cd.Opponents) != 0 || len(cd.Recent) != 0 {
		t.Fatalf("carol's detail: %+v, %v", cd, err)
	}
	for _, missing := range []string{"44444444-4444-4444-8444-444444444444", "guest_x", "", "not-a-uuid'; drop table games; --"} {
		if _, err := m.Get(ctx, missing); !errors.Is(err, members.ErrNotFound) {
			t.Errorf("Get(%q) = %v, want ErrNotFound", missing, err)
		}
	}
}

// ตรวจว่าบัญชีที่เซิร์ฟเวอร์ใช้ต่อฐานข้อมูลอ่านรายชื่อบัญชีจริงได้ (อ่านอย่างเดียว และไม่พิมพ์ข้อมูลของใครออกมา)
func TestIntegrationMembersCanReadAccounts(t *testing.T) {
	s, _ := openTestStore(t)
	list, err := s.Members().List(context.Background())
	if err != nil {
		t.Fatalf("the database role cannot list accounts: %v", err)
	}
	for _, m := range list {
		if !accountID(m.ID).Valid || m.JoinedAt.IsZero() {
			t.Fatal("an account row is missing its id or sign-up time")
		}
		if m.Games != 0 {
			t.Fatal("a fresh schema has no games, so every total must be zero")
		}
	}
}
