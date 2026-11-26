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

// หน้าจัดการรูปแบบตัวหมาก
//
// บทบาท "ผู้จัดการรูปแบบหมาก" แยกจาก admin: กำหนดด้วยรายการอีเมลใน Config.PieceEditors
// (มาจาก PIECE_EDITOR_EMAILS ใน .env) คนหนึ่งจะมีบทบาทเดียวหรือทั้งสองก็ได้ โดยใส่อีเมลในรายการที่ต้องการ
// admin ที่ไม่อยู่ในรายการนี้แก้รูปแบบหมากไม่ได้ และผู้จัดการรูปแบบหมากแก้หน้าเครดิตไม่ได้

// isPieceEditor บอกว่าตัวตนนี้มีบทบาทผู้จัดการรูปแบบหมากหรือไม่
func (a *api) isPieceEditor(id auth.Identity) bool {
	if id.Email == "" || auth.IsGuest(id.UserID) {
		return false
	}
	_, ok := a.pieceEditors[strings.ToLower(id.Email)]
	return ok
}

// pieceEditor ตรวจ token และบทบาท ไม่ใช่ผู้จัดการรูปแบบหมาก = 403
func (a *api) pieceEditor(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := a.identity(w, r)
	if !ok {
		return auth.Identity{}, false
	}
	if !a.isPieceEditor(id) {
		writeError(w, http.StatusForbidden, "forbidden")
		return auth.Identity{}, false
	}
	return id, true
}

// getPieceStyles คืนรูปแบบตัวหมากที่เพิ่มไว้ทั้งหมด ไม่ต้อง login
func (a *api) getPieceStyles(w http.ResponseWriter, r *http.Request) {
	p, err := a.cfg.Content.PieceStyles(r.Context())
	if err != nil {
		a.cfg.Logger.Error("load piece styles", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// piecesFailure แปลง error จากการแก้รูปแบบหมากเป็น response คืน true ถ้าเขียน response แล้ว
// 409 ส่งข้อมูลล่าสุดกลับไปด้วย เพื่อให้หน้าจัดการแสดงค่าที่คนอื่นแก้ไว้
func (a *api) piecesFailure(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	var field *content.FieldError
	switch {
	case errors.As(err, &field):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_style", "field": field.Field})
	case errors.Is(err, content.ErrBadOp):
		writeError(w, http.StatusBadRequest, "bad_request")
	case errors.Is(err, content.ErrLimit):
		writeError(w, http.StatusConflict, "limit")
	case errors.Is(err, content.ErrConflict):
		current, loadErr := a.cfg.Content.PieceStyles(r.Context())
		if loadErr != nil {
			a.cfg.Logger.Error("load piece styles", "err", loadErr)
		}
		writeJSON(w, http.StatusConflict, map[string]any{"error": "conflict", "styles": stylesOf(current)})
	default:
		a.cfg.Logger.Error("update piece styles", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
	}
	return true
}

func stylesOf(p *content.PieceStyles) []content.PieceStyle {
	if p == nil {
		return []content.PieceStyle{}
	}
	return p.Styles
}

// pieceWrite ตรวจบทบาทและโควตาการแก้ไข
func (a *api) pieceWrite(w http.ResponseWriter, r *http.Request) (auth.Identity, bool) {
	id, ok := a.pieceEditor(w, r)
	if !ok {
		return auth.Identity{}, false
	}
	if !a.limits.admin.Allow(id.UserID) {
		tooMany(w)
		return auth.Identity{}, false
	}
	return id, true
}

// pieceName อ่านชื่อรูปแบบจาก body {"name": "..."}
func pieceName(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body struct {
		Name string `json:"name"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return "", false
	}
	return body.Name, true
}

func revOf(r *http.Request) (int, bool) {
	rev, err := strconv.Atoi(r.URL.Query().Get("rev"))
	return rev, err == nil && rev > 0
}

func (a *api) updatePieces(w http.ResponseWriter, r *http.Request, by, what string, fn func(*content.PieceStyles) error) {
	p, err := a.cfg.Content.UpdatePieceStyles(r.Context(), by, fn)
	if a.piecesFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("piece styles changed", "by", by, "what", what)
	writeJSON(w, http.StatusOK, p)
}

// postPieceStyle เพิ่มรูปแบบใหม่ (ยังไม่มีรูป)
func (a *api) postPieceStyle(w http.ResponseWriter, r *http.Request) {
	id, ok := a.pieceWrite(w, r)
	if !ok {
		return
	}
	name, ok := pieceName(w, r)
	if !ok {
		return
	}
	a.updatePieces(w, r, id.UserID, "create", func(p *content.PieceStyles) error { return p.Create(name) })
}

// putPieceStyle เปลี่ยนชื่อรูปแบบ
func (a *api) putPieceStyle(w http.ResponseWriter, r *http.Request) {
	id, ok := a.pieceWrite(w, r)
	if !ok {
		return
	}
	rev, ok := revOf(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	name, ok := pieceName(w, r)
	if !ok {
		return
	}
	styleID := r.PathValue("id")
	a.updatePieces(w, r, id.UserID, "rename", func(p *content.PieceStyles) error { return p.Rename(styleID, rev, name) })
}

// deletePieceStyle ลบรูปแบบ พร้อมรูปทั้งหมดของรูปแบบนั้น
func (a *api) deletePieceStyle(w http.ResponseWriter, r *http.Request) {
	id, ok := a.pieceWrite(w, r)
	if !ok {
		return
	}
	rev, ok := revOf(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	styleID := r.PathValue("id")
	a.updatePieces(w, r, id.UserID, "delete", func(p *content.PieceStyles) error { return p.Delete(styleID, rev) })
}

// putPieceImage รับไฟล์รูป (PNG หรือ JPEG) เป็น body แล้วตั้งเป็นรูปของหมากหนึ่งตัวในรูปแบบ
// รูปเดิมของตัวนั้นถูกลบจากที่เก็บในขั้นตอนเดียวกัน
func (a *api) putPieceImage(w http.ResponseWriter, r *http.Request) {
	id, ok := a.pieceEditor(w, r)
	if !ok {
		return
	}
	if !a.limits.adminImage.Allow(id.UserID) {
		tooMany(w)
		return
	}
	rev, ok := revOf(r)
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
		a.cfg.Logger.Error("save piece image", "err", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable")
		return
	}
	styleID, piece := r.PathValue("id"), r.PathValue("piece")
	p, err := a.cfg.Content.UpdatePieceStyles(r.Context(), id.UserID, func(p *content.PieceStyles) error {
		return p.SetImage(styleID, rev, piece, content.ImagePath(imageID))
	})
	if err != nil {
		// ตั้งรูปไม่สำเร็จ: รูปที่เพิ่งเก็บไม่มีใครใช้ ต้องลบทิ้ง
		if delErr := a.cfg.Content.DeleteImage(r.Context(), imageID); delErr != nil {
			a.cfg.Logger.Error("delete unused piece image", "err", delErr)
		}
	}
	if a.piecesFailure(w, r, err) {
		return
	}
	a.cfg.Logger.Info("piece image set", "by", id.UserID, "piece", piece, "bytes", len(img.Data))
	writeJSON(w, http.StatusOK, p)
}

// deletePieceImage เอารูปของหมากหนึ่งตัวออก และลบรูปนั้นจากที่เก็บ
func (a *api) deletePieceImage(w http.ResponseWriter, r *http.Request) {
	id, ok := a.pieceWrite(w, r)
	if !ok {
		return
	}
	rev, ok := revOf(r)
	if !ok {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	styleID, piece := r.PathValue("id"), r.PathValue("piece")
	a.updatePieces(w, r, id.UserID, "image removed", func(p *content.PieceStyles) error {
		return p.SetImage(styleID, rev, piece, "")
	})
}
