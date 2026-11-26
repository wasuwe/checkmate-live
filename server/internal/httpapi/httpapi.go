// Package httpapi รวม HTTP route ทั้งหมดของเซิร์ฟเวอร์
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// Config คือค่าที่ต้องใช้สร้าง handler
type Config struct {
	// StaticDir คือโฟลเดอร์ไฟล์หน้าเว็บที่ build แล้ว ถ้าว่างจะไม่เสิร์ฟหน้าเว็บ (โหมด dev ใช้ Vite แทน)
	StaticDir string
	Logger    *slog.Logger

	// Hub, Auth และ Guest ต้องมาครบจึงจะเปิด route ของเกม (/api/*, /ws)
	Hub  *hub.Hub
	Auth auth.Authenticator
	// Guest ออก token ให้ผู้เล่นที่ไม่ได้ login (เฟส 4 จะแทนด้วย Supabase Auth)
	Guest *auth.Guest
}

type api struct {
	cfg Config
}

// New สร้าง http.Handler หลักของเซิร์ฟเวอร์
func New(cfg Config) http.Handler {
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	a := &api{cfg: cfg}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	if cfg.Hub != nil && cfg.Auth != nil {
		mux.HandleFunc("POST /api/rooms", a.createRoom)
		mux.HandleFunc("GET /ws", cfg.Hub.ServeWS)
		if cfg.Guest != nil {
			mux.HandleFunc("POST /api/guest", a.createGuest)
		}
		// path ใต้ /api ที่ไม่มีจริงต้องได้ 404 ไม่ใช่หน้าเว็บ
		mux.HandleFunc("/api/", http.NotFound)
	}

	if cfg.StaticDir != "" {
		mux.Handle("/", spaHandler(cfg.StaticDir))
	}

	return mux
}

// createGuest ออกตัวตนชั่วคราวให้ผู้เล่นที่ไม่ได้ login
func (a *api) createGuest(w http.ResponseWriter, _ *http.Request) {
	userID, token, err := a.cfg.Guest.Issue()
	if err != nil {
		a.cfg.Logger.Error("issue guest", "err", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"userId": userID, "token": token})
}

// createRoom สร้างห้องใหม่ ต้องส่ง token มาใน header Authorization: Bearer
func (a *api) createRoom(w http.ResponseWriter, r *http.Request) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if _, err := a.cfg.Auth.Authenticate(r.Context(), token); err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	roomID, err := a.cfg.Hub.CreateRoom()
	if err != nil {
		a.cfg.Logger.Error("create room", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"roomId": roomID})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

// spaHandler เสิร์ฟไฟล์ static และส่ง index.html ให้ทุก path ที่ไม่ใช่ไฟล์
// เพื่อให้ลิงก์ห้อง (เช่น /room/abc) เปิดตรง ๆ ได้
func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// http.Dir กัน path traversal ให้แล้ว ตรงนี้แค่เช็กว่ามีไฟล์จริงหรือไม่
		path := filepath.Join(dir, filepath.FromSlash(filepath.Clean("/"+r.URL.Path)))
		if info, err := os.Stat(path); err != nil || info.IsDir() {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}
