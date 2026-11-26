package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/content"
)

// หน้าจัดการข้อมูลของผู้ดูแล (admin)
//
// ใครเป็น admin กำหนดด้วยรายการอีเมลใน Config.Admins (มาจาก ADMIN_EMAILS ใน .env)
// อีเมลของผู้เรียกอ่านจาก JWT ที่ Supabase ลงลายเซ็น ไม่รับจาก body หรือ header อื่น
// การตรวจสิทธิ์ทำที่นี่ทุกคำขอ หน้าเว็บซ่อนเมนูให้คนที่ไม่ใช่ admin เพื่อความสะดวกเท่านั้น

// identity ตรวจ token แล้วคืนตัวตนของผู้เรียก ถ้าไม่ผ่านจะเขียน response ให้แล้วคืน false
func (a *api) identity(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return auth.Identity{}, false
	}
	id, err := auth.Identify(r.Context(), a.cfg.Auth, token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return auth.Identity{}, false
	}
	return id, true
}

// isAdmin บอกว่าตัวตนนี้อยู่ในรายการ admin หรือไม่ (guest และบัญชีที่ไม่มีอีเมลไม่มีทางเป็น admin)
func (a *api) isAdmin(id auth.Identity) bool {
	if id.Email == "" || auth.IsGuest(id.UserID) {
		return false
	}
	_, ok := a.admins[strings.ToLower(id.Email)]
	return ok
}

// admin เหมือน identity แต่ต้องเป็น admin ด้วย ไม่ใช่ = 403
func (a *api) admin(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := a.identity(w, r)
	if !ok {
		return auth.Identity{}, false
	}
	if !a.isAdmin(id) {
		writeError(w, http.StatusForbidden, "forbidden")
		return auth.Identity{}, false
	}
	return id, true
}

// getAdminMe บอกผู้เรียกว่าตัวเองเป็น admin หรือไม่ ใช้ตัดสินว่าจะแสดงเมนูจัดการหรือไม่
func (a *api) getAdminMe(w http.ResponseWriter, r *http.Request) {
	id, ok := a.identity(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"admin": a.isAdmin(id)})
}

// getCredits คืนข้อมูลหน้าเครดิต ไม่ต้อง login
// credits เป็น null ถ้ายังไม่เคยมีใครบันทึก (หน้าเว็บจะใช้ข้อมูลตัวอย่างของตัวเอง)
func (a *api) getCredits(w http.ResponseWriter, r *http.Request) {
	c, err := a.cfg.Content.Credits(r.Context())
	if err != nil {
		a.cfg.Logger.Error("load credits", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": c})
}

// putCredits บันทึกข้อมูลหน้าเครดิตทั้งชุด (admin เท่านั้น)
func (a *api) putCredits(w http.ResponseWriter, r *http.Request) {
	id, ok := a.admin(w, r)
	if !ok {
		return
	}
	if !a.limits.admin.Allow(id.UserID) {
		tooMany(w)
		return
	}
	var c content.Credits
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, content.MaxCreditsBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	if err := c.Clean(); err != nil {
		var field *content.FieldError
		if errors.As(err, &field) {
			// บอกช่องที่ผิดให้หน้าจัดการชี้ได้ (ชื่อช่องมาจากโค้ดของเรา ไม่มีข้อมูลของผู้ใช้)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_credits", "field": field.Field})
			return
		}
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	if err := a.cfg.Content.SaveCredits(r.Context(), c, id.UserID); err != nil {
		a.cfg.Logger.Error("save credits", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	a.cfg.Logger.Info("credits updated", "by", id.UserID, "people", len(c.People), "ocs", len(c.Ocs))
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": &c})
}

// postContentImage รับไฟล์รูปตัวละคร (JPEG หรือ PNG) เป็น body ตรง ๆ คืนที่อยู่ของรูป (admin เท่านั้น)
func (a *api) postContentImage(w http.ResponseWriter, r *http.Request) {
	id, ok := a.admin(w, r)
	if !ok {
		return
	}
	if !a.limits.adminImage.Allow(id.UserID) {
		tooMany(w)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, content.MaxImageBytes))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "image_too_large")
		} else {
			writeError(w, http.StatusBadRequest, "bad_request")
		}
		return
	}
	img, err := content.ProcessImage(data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_image")
		return
	}
	imageID, err := content.NewImageID()
	if err == nil {
		err = a.cfg.Content.SaveImage(r.Context(), imageID, img, id.UserID)
	}
	if err != nil {
		a.cfg.Logger.Error("save content image", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	a.cfg.Logger.Info("content image uploaded", "by", id.UserID, "bytes", len(img.Data))
	writeJSON(w, http.StatusCreated, map[string]string{"url": content.ImagePath(imageID)})
}

// getContentImage เสิร์ฟรูปตัวละคร ไม่ต้อง login
// รหัสรูปเป็นเลขสุ่มและไม่ถูกใช้ซ้ำ เนื้อหาของ URL หนึ่งจึงไม่เปลี่ยน
func (a *api) getContentImage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !content.ValidImageID(id) {
		http.NotFound(w, r)
		return
	}
	img, err := a.cfg.Content.Image(r.Context(), id)
	if errors.Is(err, content.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		a.cfg.Logger.Error("load content image", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	h := w.Header()
	h.Set("Content-Type", img.ContentType)
	h.Set("Content-Length", strconv.Itoa(len(img.Data)))
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = w.Write(img.Data)
}
