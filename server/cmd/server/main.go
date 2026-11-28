// Command server คือ backend ของ checkmate-live: ให้บริการ API, WebSocket และไฟล์หน้าเว็บ
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/content"
	"github.com/wasuwe/checkmate-live/server/internal/envfile"
	"github.com/wasuwe/checkmate-live/server/internal/httpapi"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
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
	var connectSrc []string // origin ภายนอกที่หน้าเว็บเรียกได้ ใส่ใน Content-Security-Policy
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
		// หน้าเว็บเรียก Supabase Auth ที่ origin เดียวกับ JWKS
		if u, err := url.Parse(jwksURL); err == nil && u.Host != "" {
			connectSrc = append(connectSrc, u.Scheme+"://"+u.Host)
		}
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

	// CLIENT_IP_HEADER คือ header ที่ proxy หน้าเซิร์ฟเวอร์ใส่ IP จริงของผู้ใช้ (บน Fly.io คือ "Fly-Client-IP")
	// ตั้งเฉพาะเมื่ออยู่หลัง proxy ที่เขียนทับ header นี้เสมอ ไม่งั้นผู้ใช้ปลอม IP เพื่อหลบการจำกัดได้
	ipHeader := os.Getenv("CLIENT_IP_HEADER")
	clientIP := func(r *http.Request) string { return ratelimit.ClientIP(r, ipHeader) }
	log.Info("abuse protection configured", "clientIPHeader", ipHeader)

	// START_DELAY คือเวลาที่ให้หน้าเว็บเล่นภาพโยนเหรียญก่อนนาฬิกาเริ่มนับ เช่น "5s" (ค่าเริ่มต้น) "0s" = ไม่รอ
	startDelay := 5 * time.Second
	if v := os.Getenv("START_DELAY"); v != "" {
		if startDelay, err = time.ParseDuration(v); err != nil || startDelay < 0 || startDelay > 10*time.Second {
			log.Error("invalid START_DELAY", "value", v)
			os.Exit(1)
		}
	}

	// LOBBY_COUNTDOWN คือเวลานับถอยหลังหลังผู้เล่นทั้งสองกดพร้อม เช่น "3s" (ค่าเริ่มต้น) "0s" = เริ่มทันที
	lobbyCountdown := 3 * time.Second
	if v := os.Getenv("LOBBY_COUNTDOWN"); v != "" {
		if lobbyCountdown, err = time.ParseDuration(v); err != nil || lobbyCountdown < 0 || lobbyCountdown > 30*time.Second {
			log.Error("invalid LOBBY_COUNTDOWN", "value", v)
			os.Exit(1)
		}
		if lobbyCountdown == 0 {
			lobbyCountdown = -1 // hub ใช้ค่าติดลบแทน "ไม่นับ" (0 คือใช้ค่าเริ่มต้น)
		}
	}

	// FINISHED_TTL คือเวลาที่ห้องยังเปิดอยู่หลังเกมจบก่อนปิดเอง เช่น "1m" (ค่าเริ่มต้น)
	var finishedTTL time.Duration
	if v := os.Getenv("FINISHED_TTL"); v != "" {
		if finishedTTL, err = time.ParseDuration(v); err != nil || finishedTTL < time.Second || finishedTTL > time.Hour {
			log.Error("invalid FINISHED_TTL", "value", v)
			os.Exit(1)
		}
	}

	hubCfg := hub.Config{
		OriginPatterns: splitList(os.Getenv("ALLOWED_ORIGINS")),
		AbandonGrace:   abandonGrace,
		FinishedTTL:    finishedTTL,
		StartDelay:     startDelay,
		Lobby:          true, // ห้องรอ: ต้องกดพร้อมทั้งสองคนก่อนเริ่ม
		LobbyCountdown: lobbyCountdown,
		ClientIP:       clientIP,
		Logger:         log,
	}
	// การรายงานแชทลง log เสมอ (ไม่มีเนื้อความ) และลงฐานข้อมูลถ้ามี
	var reports *store.ReportSink
	hubCfg.OnReport = func(r hub.ChatReport) {
		log.Warn("chat reported", "room", r.RoomID, "message", r.MessageID, "sender", r.SenderID, "reporter", r.ReporterID)
		if reports != nil {
			reports.Report(r)
		}
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
		reports = store.NewReportSink(db, log)
	}
	log.Info("storage configured", "database", db != nil)

	// โปรไฟล์ (ชื่อและรูป) มีเฉพาะเมื่อเปิดการ login ถ้าไม่มีฐานข้อมูลจะเก็บใน memory
	var profiles profile.Store
	if authn.User != nil {
		if db != nil {
			profiles = db.Profiles()
		} else {
			profiles = profile.NewMemory()
		}
		hubCfg.Profiles = func(ctx context.Context, userID string) hub.PlayerProfile {
			if auth.IsGuest(userID) {
				return hub.PlayerProfile{}
			}
			p, err := profiles.Get(ctx, userID)
			if err != nil {
				log.Warn("profile lookup failed", "err", err)
				return hub.PlayerProfile{}
			}
			return hub.PlayerProfile{Name: p.Name, Avatar: p.AvatarID}
		}
	}

	// เนื้อหาที่ admin แก้ได้ (หน้าเครดิต) ถ้าไม่มีฐานข้อมูลจะเก็บใน memory และหายเมื่อรีสตาร์ต
	var siteContent content.Store = content.NewMemory()
	if db != nil {
		siteContent = db.Content()
	}
	// ADMIN_EMAILS คืออีเมลของผู้ดูแล คั่นด้วย comma เช่น "a@example.com, b@example.com"
	// ใส่เฉพาะอีเมลที่สมัครบัญชีไว้แล้ว (ดูคำเตือนใน DESIGN.md) ไม่ log อีเมล แค่จำนวน
	admins := splitList(os.Getenv("ADMIN_EMAILS"))
	log.Info("admin configured", "admins", len(admins))

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
		StaticDir:  os.Getenv("STATIC_DIR"),
		Logger:     log,
		Hub:        h,
		Auth:       authn,
		Profiles:   profiles,
		Content:    siteContent,
		Admins:     admins,
		Limits:     &httpapi.DefaultLimits,
		ClientIP:   clientIP,
		ConnectSrc: connectSrc,
	}
	if guestEnabled {
		apiCfg.Guest = guest // เปิด POST /api/guest
	}
	if db != nil {
		apiCfg.Members = db.Members() // หน้าดูสมาชิกของผู้ดูแล (ต้องมีฐานข้อมูล)
	}
	handler := httpapi.New(apiCfg)

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
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
		reports.Close()
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
