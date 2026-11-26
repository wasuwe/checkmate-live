// Package httpapi รวม HTTP route ทั้งหมดของเซิร์ฟเวอร์
package httpapi

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
)

// Config คือค่าที่ต้องใช้สร้าง handler
type Config struct {
	// StaticDir คือโฟลเดอร์ไฟล์หน้าเว็บที่ build แล้ว ถ้าว่างจะไม่เสิร์ฟหน้าเว็บ (โหมด dev ใช้ Vite แทน)
	StaticDir string
	Logger    *slog.Logger
}

// New สร้าง http.Handler หลักของเซิร์ฟเวอร์
func New(cfg Config) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})

	if cfg.StaticDir != "" {
		mux.Handle("/", spaHandler(cfg.StaticDir))
	}

	return mux
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
