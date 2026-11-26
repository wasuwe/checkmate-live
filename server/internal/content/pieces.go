package content

import (
	"errors"
	"slices"
	"strings"
)

// รูปแบบตัวหมากรุกที่ผู้มีบทบาท "ผู้จัดการรูปแบบหมาก" เพิ่มจากหน้าจัดการ
// (รูปแบบเริ่มต้นของระบบอยู่ในโค้ดของหน้าเว็บ ไม่ได้อยู่ที่นี่และแก้จากหน้านี้ไม่ได้)
// รูปแบบหนึ่งมีรูปได้สูงสุด 12 รูป: หมาก 6 ชนิด × 2 สี ตัวที่ยังไม่มีรูปครบสองสีจะยังไม่ขึ้นให้ผู้เล่นเลือก

// MaxPieceStyles คือจำนวนรูปแบบสูงสุดที่เก็บได้
const MaxPieceStyles = 24

// ErrLimit คือเพิ่มรายการไม่ได้เพราะถึงจำนวนสูงสุดแล้ว
var ErrLimit = errors.New("limit reached")

// PieceCodes คือรหัสของตัวหมากทั้งหมดที่ใส่รูปได้ (สี + ชนิด)
var PieceCodes = []string{"wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"}

// PieceStyle คือรูปแบบตัวหมากหนึ่งชุด
type PieceStyle struct {
	ID string `json:"id"`
	// Rev คือเลขรุ่น เพิ่มทุกครั้งที่ถูกแก้ ใช้กันการแก้ทับกัน
	Rev  int    `json:"rev"`
	Name string `json:"name"`
	// Images คือที่อยู่รูปของหมากแต่ละตัว (รหัสตัวหมาก → "/api/content-images/<id>")
	Images map[string]string `json:"images"`
}

// PieceStyles คือรูปแบบทั้งหมด เรียงตามลำดับที่สร้าง
type PieceStyles struct {
	Styles []PieceStyle `json:"styles"`
}

// Clean ตรวจและจัดข้อมูลให้อยู่ในรูปที่ใช้ได้
func (p *PieceStyles) Clean() error {
	if p.Styles == nil {
		p.Styles = []PieceStyle{}
	}
	if len(p.Styles) > MaxPieceStyles {
		return bad("styles")
	}
	seen := map[string]bool{}
	for i := range p.Styles {
		s := &p.Styles[i]
		var ok bool
		if !idRe.MatchString(s.ID) || seen[s.ID] {
			return bad("styles[%d].id", i)
		}
		seen[s.ID] = true
		if s.Rev < 1 {
			return bad("styles[%d].rev", i)
		}
		if s.Name, ok = cleanText(s.Name, 1, 30, true); !ok {
			return bad("styles[%d].name", i)
		}
		if s.Images == nil {
			s.Images = map[string]string{}
		}
		for piece, image := range s.Images {
			id, found := strings.CutPrefix(image, imagePathPrefix)
			if !slices.Contains(PieceCodes, piece) || !found || !ValidImageID(id) {
				return bad("styles[%d].images", i)
			}
		}
	}
	return nil
}

// Clone คืนสำเนาที่แก้ได้โดยไม่กระทบต้นฉบับ
func (p *PieceStyles) Clone() PieceStyles {
	out := PieceStyles{Styles: make([]PieceStyle, len(p.Styles))}
	for i, s := range p.Styles {
		images := make(map[string]string, len(s.Images))
		for k, v := range s.Images {
			images[k] = v
		}
		s.Images = images
		out.Styles[i] = s
	}
	return out
}

// ImageIDs คืนรหัสของรูปทั้งหมดที่ข้อมูลนี้ใช้อยู่
func (p *PieceStyles) ImageIDs() []string {
	var out []string
	for _, s := range p.Styles {
		for _, image := range s.Images {
			if id, ok := strings.CutPrefix(image, imagePathPrefix); ok && ValidImageID(id) {
				out = append(out, id)
			}
		}
	}
	return out
}

// UnusedPieceImages คืนรหัสรูปที่ before ใช้อยู่แต่ after ไม่ใช้แล้ว ซึ่งต้องลบออกจากที่เก็บ
func UnusedPieceImages(before, after *PieceStyles) []string {
	still := after.ImageIDs()
	var out []string
	for _, id := range before.ImageIDs() {
		if !slices.Contains(still, id) && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

func (p *PieceStyles) index(id string, rev int) (int, error) {
	i := slices.IndexFunc(p.Styles, func(s PieceStyle) bool { return s.ID == id })
	if i < 0 || p.Styles[i].Rev != rev {
		return 0, ErrConflict
	}
	return i, nil
}

// Create เพิ่มรูปแบบใหม่ที่ยังไม่มีรูป
func (p *PieceStyles) Create(name string) error {
	if len(p.Styles) >= MaxPieceStyles {
		return ErrLimit
	}
	taken := make([]string, len(p.Styles))
	for i, s := range p.Styles {
		taken[i] = s.ID
	}
	p.Styles = append(p.Styles, PieceStyle{ID: newItemID("s", taken), Rev: 1, Name: name, Images: map[string]string{}})
	return p.Clean()
}

// Rename เปลี่ยนชื่อรูปแบบ
func (p *PieceStyles) Rename(id string, rev int, name string) error {
	i, err := p.index(id, rev)
	if err != nil {
		return err
	}
	p.Styles[i].Name = name
	p.Styles[i].Rev++
	return p.Clean()
}

// Delete ลบรูปแบบ (รูปของรูปแบบนั้นถูกลบจากที่เก็บโดยผู้เรียก ผ่าน UnusedPieceImages)
func (p *PieceStyles) Delete(id string, rev int) error {
	i, err := p.index(id, rev)
	if err != nil {
		return err
	}
	p.Styles = slices.Delete(p.Styles, i, i+1)
	return nil
}

// SetImage ตั้งหรือเอารูปของหมากหนึ่งตัวออก (image ว่าง = เอาออก)
func (p *PieceStyles) SetImage(id string, rev int, piece, image string) error {
	if !slices.Contains(PieceCodes, piece) {
		return ErrBadOp
	}
	i, err := p.index(id, rev)
	if err != nil {
		return err
	}
	if image == "" {
		delete(p.Styles[i].Images, piece)
	} else {
		p.Styles[i].Images[piece] = image
	}
	p.Styles[i].Rev++
	return p.Clean()
}
