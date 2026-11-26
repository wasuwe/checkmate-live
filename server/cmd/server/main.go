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
	"github.com/wasuwe/checkmate-live/server/internal/httpapi"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	addr := envOr("ADDR", ":8080")

	// GUEST_SECRET ทำให้ token ของ guest ใช้ต่อได้หลังรีสตาร์ต ถ้าไม่ตั้งจะสุ่มใหม่ทุกครั้งที่เริ่ม
	guest, err := auth.NewGuest([]byte(os.Getenv("GUEST_SECRET")))
	if err != nil {
		log.Error("init guest auth", "err", err)
		os.Exit(1)
	}

	h := hub.New(hub.Config{
		OriginPatterns: splitList(os.Getenv("ALLOWED_ORIGINS")),
		Logger:         log,
	}, guest)
	defer h.Close()

	handler := httpapi.New(httpapi.Config{
		StaticDir: os.Getenv("STATIC_DIR"),
		Logger:    log,
		Hub:       h,
		Auth:      guest,
		Guest:     guest,
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

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
