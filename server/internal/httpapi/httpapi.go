// Package httpapi รวม HTTP route ทั้งหมดของเซิร์ฟเวอร์
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/game"
	"github.com/wasuwe/checkmate-live/server/internal/hub"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
	"github.com/wasuwe/checkmate-live/server/internal/ratelimit"
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
	// Profiles เก็บชื่อและรูปของผู้ใช้ที่ login ถ้าเป็น nil จะไม่เปิด route ของโปรไฟล์
	Profiles profile.Store

	// Limits คือโควตาของ API ถ้าเป็น nil จะไม่จำกัด (ใช้ใน test) ตัวจริงใช้ &DefaultLimits
	Limits *Limits
	// ClientIP คืนตัวระบุเครื่องของผู้ส่งคำขอ ถ้าเป็น nil ใช้ที่อยู่ของ connection
	ClientIP func(*http.Request) string
	// ConnectSrc คือ origin ภายนอกที่หน้าเว็บเรียกได้ (เช่น URL ของ Supabase) ใส่ใน CSP
	ConnectSrc []string
}

type api struct {
	cfg    Config
	limits limiters
}

// New สร้าง http.Handler หลักของเซิร์ฟเวอร์
func New(cfg Config) http.Handler {
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	if cfg.ClientIP == nil {
		cfg.ClientIP = func(r *http.Request) string { return ratelimit.ClientIP(r, "") }
	}
	a := &api{cfg: cfg, limits: newLimiters(cfg.Limits)}
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
		if cfg.Profiles != nil {
			mux.HandleFunc("GET /api/profile", a.getProfile)
			mux.HandleFunc("PUT /api/profile", a.putProfile)
			mux.HandleFunc("PUT /api/profile/avatar", a.putAvatar)
			mux.HandleFunc("DELETE /api/profile/avatar", a.deleteAvatar)
			mux.HandleFunc("GET /api/avatars/{id}", a.getAvatar)
		}
		// path ใต้ /api ที่ไม่มีจริงต้องได้ 404 ไม่ใช่หน้าเว็บ
		mux.HandleFunc("/api/", http.NotFound)
	}

	if cfg.StaticDir != "" {
		mux.Handle("/", spaHandler(cfg.StaticDir))
	}

	return a.securityHeaders(a.limitByIP(mux))
}

// createGuest ออกตัวตนชั่วคราวให้ผู้เล่นที่ไม่ได้ login
func (a *api) createGuest(w http.ResponseWriter, r *http.Request) {
	if !a.limits.guest.Allow(a.cfg.ClientIP(r)) {
		tooMany(w)
		return
	}
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
	userID, err := a.cfg.Auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if !a.limits.createRoom.Allow(userID) {
		tooMany(w)
		return
	}

	variant, tc, problem := readRoomOptions(w, r)
	if problem != "" {
		writeError(w, http.StatusBadRequest, problem)
		return
	}

	roomID, err := a.cfg.Hub.CreateGameRoom(variant, tc, userID)
	switch {
	case errors.Is(err, hub.ErrTooManyRooms):
		// ผู้ใช้มีห้องที่ยังไม่จบค้างอยู่ครบจำนวนแล้ว
		writeError(w, http.StatusTooManyRequests, "too_many_rooms")
		return
	case errors.Is(err, hub.ErrServerFull):
		writeError(w, http.StatusServiceUnavailable, "server_full")
		return
	case err != nil:
		a.cfg.Logger.Error("create room", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"roomId": roomID})
}

// readRoomOptions อ่าน body แบบ {"timeControl":"5+3","game":"makruk"} ค่าที่ไม่ส่งมาใช้ค่าเริ่มต้น
// (หมากรุกสากล เวลา DefaultTimeControl) คืนรหัส error ที่ไม่ว่างถ้า body ใช้ไม่ได้
func readRoomOptions(w http.ResponseWriter, r *http.Request) (game.Variant, hub.TimeControl, string) {
	var body struct {
		TimeControl string `json:"timeControl"`
		Game        string `json:"game"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		return "", hub.TimeControl{}, "bad_time_control"
	}
	variant, ok := game.ParseVariant(body.Game)
	if !ok {
		return "", hub.TimeControl{}, "bad_game"
	}
	if body.TimeControl == "" {
		return variant, hub.DefaultTimeControl, ""
	}
	tc, err := hub.ParseTimeControl(body.TimeControl)
	if err != nil {
		return "", hub.TimeControl{}, "bad_time_control"
	}
	return variant, tc, ""
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
