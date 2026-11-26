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

// creditsFailure แปลง error จากการแก้ข้อมูลเครดิตเป็น response คืน true ถ้าเขียน response แล้ว
// 409 ส่งข้อมูลล่าสุดกลับไปด้วย เพื่อให้หน้าจัดการแสดงค่าที่คนอื่นแก้ไว้ได้ทันที
func (a *api) creditsFailure(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	var field *content.FieldError
	conflict := ""
	switch {
	case errors.As(err, &field):
		// ชื่อช่องมาจากโค้ดของเรา ไม่มีข้อมูลของผู้ใช้
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_credits", "field": field.Field})
		return true
	case errors.Is(err, content.ErrBadOp):
		writeError(w, http.StatusBadRequest, "bad_request")
		return true
	case errors.Is(err, content.ErrConflict):
		conflict = "conflict"
	case errors.Is(err, content.ErrInUse):
		conflict = "in_use"
	case errors.Is(err, content.ErrExists):
		conflict = "exists"
	case errors.Is(err, content.ErrNoCredits):
		conflict = "not_created"
	default:
		a.cfg.Logger.Error("update credits", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return true
	}
	current, loadErr := a.cfg.Content.Credits(r.Context())
	if loadErr != nil {
		a.cfg.Logger.Error("load credits", "err", loadErr)
	}
	writeJSON(w, http.StatusConflict, map[string]any{"error": conflict, "credits": current})
	return true
}

// adminWrite ตรวจว่าเป็น admin และยังไม่เกินโควตา คืนตัวตนของผู้เรียก
func (a *api) adminWrite(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := a.admin(w, r)
	if !ok {
		return auth.Identity{}, false
	}
	if !a.limits.admin.Allow(id.UserID) {
		tooMany(w)
		return auth.Identity{}, false
	}
	return id, true
}

// putCredits ตั้งต้นข้อมูลหน้าเครดิตทั้งชุด ทำได้เฉพาะตอนที่ยังไม่มีข้อมูล (admin เท่านั้น)
// หลังจากนั้นการแก้ทั้งหมดทำทีละรายการผ่าน postCreditsOp
func (a *api) putCredits(w http.ResponseWriter, r *http.Request) {
	id, ok := a.adminWrite(w, r)
	if !ok {
		return
	}
	var c content.Credits
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, content.MaxCreditsBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	err := c.Seed()
	if err == nil {
		err = a.cfg.Content.InitCredits(r.Context(), c, id.UserID)
	}
	if a.creditsFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("credits created", "by", id.UserID, "people", len(c.People), "ocs", len(c.Ocs))
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": &c})
}

// postCreditsOp แก้ข้อมูลเครดิตหนึ่งรายการ: เพิ่ม บันทึก ลบ หรือจัดลำดับ (admin เท่านั้น)
// ถ้ารายการถูกคนอื่นแก้ไปก่อน ตอบ 409 พร้อมข้อมูลล่าสุด และไม่มีอะไรถูกบันทึก
func (a *api) postCreditsOp(w http.ResponseWriter, r *http.Request) {
	id, ok := a.adminWrite(w, r)
	if !ok {
		return
	}
	var op content.Op
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&op); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	c, err := a.cfg.Content.UpdateCredits(r.Context(), id.UserID, func(c *content.Credits) error { return c.Apply(op) })
	if a.creditsFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("credits changed", "by", id.UserID, "op", op.Op, "kind", op.Kind)
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": c})
}

// imageTarget อ่านชนิด (ocs หรือ people) และรหัสรายการจาก path และเลขรุ่นจาก query ?rev=
func imageTarget(r *http.Request) (kind, id string, rev int, ok bool) {
	rev, err := strconv.Atoi(r.URL.Query().Get("rev"))
	kind = r.PathValue("kind")
	return kind, r.PathValue("id"), rev, err == nil && rev > 0 && (kind == content.KindOcs || kind == content.KindPeople)
}

// putOcImage รับไฟล์รูป (JPEG หรือ PNG) เป็น body แล้วตั้งเป็นรูปของตัวละครหรือของคนทันที (admin เท่านั้น)
// รูปเดิมของตัวละครถูกลบจากที่เก็บในขั้นตอนเดียวกัน
func (a *api) putOcImage(w http.ResponseWriter, r *http.Request) {
	id, ok := a.admin(w, r)
	if !ok {
		return
	}
	if !a.limits.adminImage.Allow(id.UserID) {
		tooMany(w)
		return
	}
	kind, ocID, rev, ok := imageTarget(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request")
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
	c, err := a.cfg.Content.UpdateCredits(r.Context(), id.UserID, func(c *content.Credits) error {
		return c.SetImage(kind, ocID, rev, content.ImagePath(imageID))
	})
	if err != nil {
		// ตั้งรูปไม่สำเร็จ (เช่น มีคนแก้ตัวละครไปก่อน): รูปที่เพิ่งเก็บไม่มีใครใช้ ต้องลบทิ้ง
		if delErr := a.cfg.Content.DeleteImage(r.Context(), imageID); delErr != nil {
			a.cfg.Logger.Error("delete unused content image", "err", delErr)
		}
	}
	if a.creditsFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("oc image set", "by", id.UserID, "bytes", len(img.Data))
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": c})
}

// deleteOcImage เอารูปของตัวละครออก และลบรูปนั้นจากที่เก็บ (admin เท่านั้น)
func (a *api) deleteOcImage(w http.ResponseWriter, r *http.Request) {
	id, ok := a.adminWrite(w, r)
	if !ok {
		return
	}
	kind, ocID, rev, ok := imageTarget(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	c, err := a.cfg.Content.UpdateCredits(r.Context(), id.UserID, func(c *content.Credits) error {
		return c.SetImage(kind, ocID, rev, "")
	})
	if a.creditsFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("oc image removed", "by", id.UserID)
	writeJSON(w, http.StatusOK, map[string]*content.Credits{"credits": c})
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
