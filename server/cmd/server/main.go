// Command server คือ backend ของ checkmate-live: ให้บริการ API, WebSocket และไฟล์หน้าเว็บ
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/envfile"
	"github.com/wasuwe/checkmate-live/server/internal/httpapi"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// ตอนพัฒนาในเครื่อง ค่าต่าง ๆ อ่านจากไฟล์ .env ได้ บนเซิร์ฟเวอร์จริงมาจาก environment
	if err := envfile.Load(".env"); err != nil {
		log.Error("read .env", "err", err)
		os.Exit(1)
	}

	addr := envOr("ADDR", ":8080")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// GUEST_SECRET ทำให้ token ของ guest ใช้ต่อได้หลังรีสตาร์ต ถ้าไม่ตั้งจะสุ่มใหม่ทุกครั้งที่เริ่ม
	guest, err := auth.NewGuest([]byte(os.Getenv("GUEST_SECRET")))
	if err != nil {
		log.Error("init guest auth", "err", err)
		os.Exit(1)
	}

	// ผู้ใช้ที่ login: ตรวจ JWT ของ Supabase ผ่าน JWKS (ถ้าไม่ตั้ง SUPABASE_JWKS_URL จะมีแต่ guest)
	// GUEST_ENABLED=false ปิดการเล่นแบบไม่ login
	authn := auth.Multi{}
	guestEnabled := os.Getenv("GUEST_ENABLED") != "false"
	if guestEnabled {
		authn.Guest = guest
	}
	if jwksURL := os.Getenv("SUPABASE_JWKS_URL"); jwksURL != "" {
		supabase, err := auth.NewSupabase(ctx, jwksURL)
		if err != nil {
			log.Error("init supabase auth", "err", err)
			os.Exit(1)
		}
		authn.User = supabase
	}
	if authn.Guest == nil && authn.User == nil {
		log.Error("no way to sign in: set SUPABASE_JWKS_URL or leave GUEST_ENABLED on")
		os.Exit(1)
	}
	log.Info("auth configured", "guest", authn.Guest != nil, "supabase", authn.User != nil)

	// ABANDON_GRACE คือเวลาที่ผู้เล่นซึ่งหลุดกลับเข้ามาได้ก่อนถูกปรับแพ้ เช่น "60s" (ค่าเริ่มต้น)
	var abandonGrace time.Duration
	if v := os.Getenv("ABANDON_GRACE"); v != "" {
		if abandonGrace, err = time.ParseDuration(v); err != nil || abandonGrace <= 0 {
			log.Error("invalid ABANDON_GRACE", "value", v)
			os.Exit(1)
		}
	}

	hubCfg := hub.Config{
		OriginPatterns: splitList(os.Getenv("ALLOWED_ORIGINS")),
		AbandonGrace:   abandonGrace,
		Logger:         log,
	}

	// ฐานข้อมูล: ถ้าไม่ตั้ง DATABASE_URL ทุกอย่างอยู่ใน memory และหายเมื่อรีสตาร์ต
	var (
		db     *store.Store
		writer *store.Writer
		saved  []hub.RoomSnapshot
	)
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		startCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		db, err = store.Open(startCtx, dbURL, "")
		if err == nil {
			err = db.Migrate(startCtx)
		}
		if err == nil {
			saved, err = db.LoadActiveRooms(startCtx)
		}
		cancel()
		if err != nil {
			// เริ่มต่อโดยไม่มีฐานข้อมูลจะทำให้เกมหายเงียบ ๆ จึงหยุดดีกว่า
			log.Error("database unavailable", "err", err)
			os.Exit(1)
		}
		writer = store.NewWriter(db, log)
		hubCfg.Store = writer
	}
	log.Info("storage configured", "database", db != nil)

	h := hub.New(hubCfg, authn)
	restored := 0
	for _, snap := range saved {
		if err := h.RestoreRoom(snap); err != nil {
			log.Warn("room not restored", "room", snap.ID, "err", err)
			writer.DeleteRoom(snap.ID) // กู้ไม่ได้แล้ว ไม่ต้องลองอีกทุกครั้งที่เริ่ม
			continue
		}
		restored++
	}
	if db != nil {
		log.Info("rooms restored", "count", restored, "skipped", len(saved)-restored)
	}

	apiCfg := httpapi.Config{
		StaticDir: os.Getenv("STATIC_DIR"),
		Logger:    log,
		Hub:       h,
		Auth:      authn,
	}
	if guestEnabled {
		apiCfg.Guest = guest // เปิด POST /api/guest
	}
	handler := httpapi.New(apiCfg)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Info("server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server failed", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown failed", "err", err)
	}

	// ลำดับสำคัญ: ปิดห้องก่อน (แต่ละห้องบันทึกสถานะสุดท้าย) แล้วรอให้เขียนลงฐานข้อมูลเสร็จ
	h.Close()
	if writer != nil {
		if left := writer.Close(shutdownCtx); left > 0 {
			log.Error("some data was not saved before shutdown", "jobs", left)
		}
		db.Close()
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// splitList แยกค่าที่คั่นด้วย comma และตัดช่องว่าง เช่น ALLOWED_ORIGINS
// แต่ละค่าเป็น host ("chess.example.com") หรือมี scheme ("https://chess.example.com") ก็ได้
func splitList(s string) []string {
	var out []string
	for part := range strings.SplitSeq(s, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
