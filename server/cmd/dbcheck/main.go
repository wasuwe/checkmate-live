// Command dbcheck ตรวจว่า DATABASE_URL ใช้ต่อฐานข้อมูลได้ โดยไม่แสดงรหัสผ่าน
// ใช้: go run ./cmd/dbcheck            (อ่าน .env ในโฟลเดอร์ปัจจุบัน)
//
//	go run ./cmd/dbcheck -try-poolers  (ลอง host ของ Supabase pooler ใน region ที่ระบุด้วย)
package main

import (
	"context"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/wasuwe/checkmate-live/server/internal/envfile"
)

func main() {
	region := flag.String("try-poolers", "", "ลอง Supabase session pooler ของ region นี้ด้วย เช่น ap-southeast-1")
	summary := flag.Bool("summary", false, "แสดงจำนวนห้องตามสถานะ และเกมล่าสุด 5 เกม")
	reports := flag.Bool("reports", false, "แสดงข้อความแชทที่ถูกรายงานล่าสุด 20 รายการ")
	flag.Parse()

	if err := envfile.Load(".env"); err != nil {
		fmt.Println("อ่าน .env ไม่ได้:", err)
		os.Exit(1)
	}
	raw := os.Getenv("DATABASE_URL")
	if raw == "" {
		fmt.Println("ไม่พบ DATABASE_URL")
		os.Exit(1)
	}
	u, err := url.Parse(raw)
	if err != nil || u.User == nil {
		fmt.Println("DATABASE_URL รูปแบบไม่ถูกต้อง")
		os.Exit(1)
	}

	if *summary {
		if err := printSummary(raw, password(u)); err != nil {
			os.Exit(1)
		}
		return
	}

	if *reports {
		if err := printReports(raw, password(u)); err != nil {
			os.Exit(1)
		}
		return
	}

	ok := try("ตามไฟล์ .env", u)
	if *region != "" {
		for _, prefix := range []string{"aws-0", "aws-1"} {
			alt := *u
			alt.Host = fmt.Sprintf("%s-%s.pooler.supabase.com:5432", prefix, *region)
			if try("session pooler "+prefix, &alt) {
				ok = true
			}
		}
	}
	if !ok {
		os.Exit(1)
	}
}

// try ลองต่อฐานข้อมูลและพิมพ์ผล โดยตัดรหัสผ่านออกจากทุกข้อความ
func try(label string, u *url.URL) bool {
	password, _ := u.User.Password()
	fmt.Printf("%-22s host=%s user=%s\n", label+":", u.Host, u.User.Username())

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, u.String())
	if err != nil {
		fmt.Println("  ไม่สำเร็จ:", redact(err.Error(), password))
		return false
	}
	defer conn.Close(ctx)

	var version, user string
	if err := conn.QueryRow(ctx, "select version(), current_user").Scan(&version, &user); err != nil {
		fmt.Println("  ต่อได้แต่ query ไม่ผ่าน:", redact(err.Error(), password))
		return false
	}
	fmt.Printf("  สำเร็จ: %s (user %s)\n", strings.SplitN(version, " on ", 2)[0], user)
	return true
}

func password(u *url.URL) string {
	p, _ := u.User.Password()
	return p
}

// printSummary แสดงภาพรวมของข้อมูลที่เซิร์ฟเวอร์บันทึกไว้
func printSummary(databaseURL, password string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fail := func(err error) error {
		fmt.Println("ไม่สำเร็จ:", redact(err.Error(), password))
		return err
	}

	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fail(err)
	}
	defer conn.Close(ctx)

	rows, err := conn.Query(ctx, "select status, count(*) from rooms group by status order by status")
	if err != nil {
		return fail(err)
	}
	fmt.Println("rooms:")
	var status string
	var n int
	if _, err := pgx.ForEachRow(rows, []any{&status, &n}, func() error {
		fmt.Printf("  %-9s %d\n", status, n)
		return nil
	}); err != nil {
		return fail(err)
	}

	rows, err = conn.Query(ctx, `
		select room_id, result, reason, time_control, white_id is not null, black_id is not null,
		       round(extract(epoch from ended_at - started_at))::int, pgn
		from games order by ended_at desc limit 5`)
	if err != nil {
		return fail(err)
	}
	fmt.Println("games (ล่าสุด 5 เกม):")
	var (
		room, result, reason, tc, pgn string
		whiteAcct, blackAcct          bool
		seconds                       int
	)
	if _, err := pgx.ForEachRow(rows, []any{&room, &result, &reason, &tc, &whiteAcct, &blackAcct, &seconds, &pgn}, func() error {
		fmt.Printf("  %s  %-7s %-9s %-5s white_account=%-5v black_account=%-5v %ds  pgn=%q\n",
			room, result, reason, tc, whiteAcct, blackAcct, seconds, pgn)
		return nil
	}); err != nil {
		return fail(err)
	}
	return nil
}

// printReports แสดงข้อความแชทที่ถูกรายงานล่าสุด
func printReports(databaseURL, password string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	fail := func(err error) error {
		fmt.Println("ไม่สำเร็จ:", redact(err.Error(), password))
		return err
	}

	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fail(err)
	}
	defer conn.Close(ctx)

	rows, err := conn.Query(ctx, `
		select to_char(reported_at, 'YYYY-MM-DD HH24:MI'), room_id, sender_id, reporter_id, message
		from chat_reports order by reported_at desc limit 20`)
	if err != nil {
		return fail(err)
	}
	fmt.Println("chat reports (ล่าสุด 20 รายการ):")
	var at, room, sender, reporter, message string
	n := 0
	if _, err := pgx.ForEachRow(rows, []any{&at, &room, &sender, &reporter, &message}, func() error {
		n++
		fmt.Printf("  %s  room=%s\n    sender=%s\n    reporter=%s\n    message=%q\n", at, room, sender, reporter, message)
		return nil
	}); err != nil {
		return fail(err)
	}
	if n == 0 {
		fmt.Println("  (ไม่มี)")
	}
	return nil
}

func redact(msg, password string) string {
	if password != "" {
		msg = strings.ReplaceAll(msg, password, "****")
		msg = strings.ReplaceAll(msg, url.QueryEscape(password), "****")
	}
	return msg
}
