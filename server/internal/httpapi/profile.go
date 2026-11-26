package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/wasuwe/checkmate-live/server/internal/auth"
	"github.com/wasuwe/checkmate-live/server/internal/profile"
)

// account ตรวจ token และคืน user ID ของบัญชีที่ login
// ถ้าไม่ผ่านจะเขียน response ให้แล้วคืน false (guest ไม่มีโปรไฟล์)
func (a *api) account(w http.ResponseWriter, r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	userID, err := a.cfg.Auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	if auth.IsGuest(userID) {
		writeError(w, http.StatusForbidden, "account_required")
		return "", false
	}
	return userID, true
}

func (a *api) profileResult(w http.ResponseWriter, p profile.Profile, err error) {
	if err != nil {
		a.cfg.Logger.Error("profile store", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// getProfile คืนโปรไฟล์ของผู้เรียกเอง
func (a *api) getProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.account(w, r)
	if !ok {
		return
	}
	p, err := a.cfg.Profiles.Get(r.Context(), userID)
	a.profileResult(w, p, err)
}

// putProfile ตั้งชื่อที่แสดง body: {"name":"..."} ชื่อว่าง = ลบชื่อ
// เจ้าของโปรไฟล์มาจาก token เท่านั้น ไม่รับ user ID จาก body
func (a *api) putProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.account(w, r)
	if !ok {
		return
	}
	if !a.limits.profile.Allow(userID) {
		tooMany(w)
		return
	}
	var body struct {
		Name *string `json:"name"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil || body.Name == nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	name, ok := profile.CleanName(*body.Name)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_name")
		return
	}
	p, err := a.cfg.Profiles.SetName(r.Context(), userID, name)
	a.profileResult(w, p, err)
}

// putAvatar รับไฟล์รูป (JPEG หรือ PNG) เป็น body ตรง ๆ
func (a *api) putAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.account(w, r)
	if !ok {
		return
	}
	if !a.limits.avatar.Allow(userID) {
		tooMany(w)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, profile.MaxAvatarBytes))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "image_too_large")
		} else {
			writeError(w, http.StatusBadRequest, "bad_request")
		}
		return
	}
	avatar, err := profile.ProcessAvatar(data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_image")
		return
	}
	id, err := profile.NewAvatarID()
	if err != nil {
		a.profileResult(w, profile.Profile{}, err)
		return
	}
	p, err := a.cfg.Profiles.SetAvatar(r.Context(), userID, id, avatar)
	a.profileResult(w, p, err)
}

func (a *api) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := a.account(w, r)
	if !ok {
		return
	}
	if !a.limits.profile.Allow(userID) {
		tooMany(w)
		return
	}
	p, err := a.cfg.Profiles.DeleteAvatar(r.Context(), userID)
	a.profileResult(w, p, err)
}

// getAvatar เสิร์ฟรูปโปรไฟล์ ไม่ต้อง login เพราะคู่แข่งและผู้ชมต้องเห็นรูปได้
// รหัสรูปเป็นเลขสุ่มและเปลี่ยนทุกครั้งที่อัปโหลด เนื้อหาของ URL หนึ่งจึงไม่เปลี่ยน
func (a *api) getAvatar(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !profile.ValidAvatarID(id) {
		http.NotFound(w, r)
		return
	}
	avatar, err := a.cfg.Profiles.Avatar(r.Context(), id)
	if errors.Is(err, profile.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		a.cfg.Logger.Error("load avatar", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	h := w.Header()
	h.Set("Content-Type", avatar.ContentType)
	h.Set("Content-Length", strconv.Itoa(len(avatar.Data)))
	h.Set("Cache-Control", "public, max-age=31536000, immutable")
	// ไฟล์ที่ผู้ใช้อัปโหลด: ห้ามเบราว์เซอร์เดาชนิดเอง และห้ามรันอะไรถ้าถูกเปิดตรง ๆ
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = w.Write(avatar.Data)
}
