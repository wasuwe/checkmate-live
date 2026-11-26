package content

import (
	"errors"
	"slices"
	"strconv"
	"strings"
)

// การแก้ข้อมูลเครดิตทำทีละรายการ (คนหนึ่งคน กลุ่มหนึ่งกลุ่ม ตัวละครหนึ่งตัว)
// ทุกรายการมีเลขรุ่น (Rev) ที่เพิ่มขึ้นทุกครั้งที่ถูกแก้ ผู้แก้ต้องส่งเลขรุ่นที่ตัวเองเห็นมาด้วย
// ถ้าไม่ตรงกับของจริง แปลว่ามีคนอื่นแก้รายการนั้นไปก่อน การแก้จะถูกปฏิเสธ (ErrConflict) ไม่มีการทับกัน
// ผู้ดูแลสองคนแก้คนละรายการพร้อมกันได้ เพราะแต่ละคำขอแก้เฉพาะรายการของตัวเองภายใต้ lock ของที่เก็บ

var (
	// ErrConflict คือรายการถูกคนอื่นแก้หรือลบไปแล้วตั้งแต่ผู้แก้โหลดมา
	ErrConflict = errors.New("item was changed by someone else")
	// ErrInUse คือลบคนที่ยังเป็นเจ้าของหรือผู้วาดของตัวละครอยู่
	ErrInUse = errors.New("person is still used by a character")
	// ErrExists คือพยายามตั้งต้นข้อมูลทั้งที่มีข้อมูลอยู่แล้ว
	ErrExists = errors.New("credits already exist")
	// ErrNoCredits คือยังไม่มีข้อมูลเครดิตให้แก้ (ต้องตั้งต้นก่อน)
	ErrNoCredits = errors.New("credits have not been created")
	// ErrBadOp คือคำสั่งแก้ไขที่รูปแบบไม่ถูกต้อง
	ErrBadOp = errors.New("bad operation")
)

// ชนิดของรายการ
const (
	KindPeople = "people"
	KindTeam   = "team"
	KindOcs    = "ocs"
)

// คำสั่งแก้ไข
const (
	OpCreate = "create"
	OpSave   = "save"
	OpDelete = "delete"
	OpOrder  = "order"
)

// Op คือคำสั่งแก้ไขหนึ่งคำสั่งจากหน้าจัดการ
type Op struct {
	Op   string `json:"op"`
	Kind string `json:"kind"`
	// ID และ Rev ระบุรายการและเลขรุ่นที่ผู้แก้เห็น (ใช้กับ save และ delete)
	ID  string `json:"id,omitempty"`
	Rev int    `json:"rev,omitempty"`
	// ค่าใหม่ของรายการ (ใช้กับ save) ใส่เฉพาะตัวที่ตรงกับ Kind
	Person *Person    `json:"person,omitempty"`
	Group  *TeamGroup `json:"group,omitempty"`
	Oc     *Oc        `json:"oc,omitempty"`
	// IDs คือลำดับใหม่ของทั้งรายการ (ใช้กับ order)
	IDs []string `json:"ids,omitempty"`
}

// newItemID คืนรหัสใหม่ที่ไม่ซ้ำกับที่มีอยู่ เช่น "p7" (รหัสใช้ภายใน ผู้ชมไม่เห็น)
func newItemID(prefix string, taken []string) string {
	for n := len(taken) + 1; ; n++ {
		id := prefix + strconv.Itoa(n)
		if !slices.Contains(taken, id) {
			return id
		}
	}
}

func personIDs(c *Credits) []string {
	out := make([]string, len(c.People))
	for i, p := range c.People {
		out[i] = p.ID
	}
	return out
}

func groupIDs(c *Credits) []string {
	out := make([]string, len(c.Team))
	for i, g := range c.Team {
		out[i] = g.ID
	}
	return out
}

func ocIDs(c *Credits) []string {
	out := make([]string, len(c.Ocs))
	for i, o := range c.Ocs {
		out[i] = o.ID
	}
	return out
}

var newColors = []string{"#FFB8CC", "#9FE3C9", "#C9BDFF", "#FFDC85", "#A9D6F7", "#F7C59F"}
var newOcColors = [][2]string{
	{"#FF8FB1", "#FFE8EF"}, {"#FFD36E", "#FFF7DA"}, {"#86D9B9", "#E8FAF2"},
	{"#B9AAF5", "#F1EDFF"}, {"#8CC7F2", "#E6F4FF"}, {"#C69B72", "#F7E9D7"},
}

// Apply ทำคำสั่งแก้ไขกับข้อมูล แล้วตรวจข้อมูลทั้งชุด (Clean)
// ถ้าคืน error ข้อมูลอาจถูกแก้ไปบางส่วน ผู้เรียกต้องทิ้งสำเนานั้น
func (c *Credits) Apply(op Op) error {
	var err error
	switch op.Kind {
	case KindPeople:
		err = c.applyPerson(op)
	case KindTeam:
		err = c.applyGroup(op)
	case KindOcs:
		err = c.applyOc(op)
	default:
		return ErrBadOp
	}
	if err != nil {
		return err
	}
	return c.Clean()
}

// reorder จัดลำดับ items ตาม ids ซึ่งต้องเป็นรายการเดียวกับที่มีอยู่ (ไม่ขาด ไม่เกิน ไม่ซ้ำ)
// ถ้าไม่ตรง แปลว่ามีคนเพิ่มหรือลบรายการไปแล้ว
func reorder[T any](items []T, current, ids []string) ([]T, error) {
	if len(ids) != len(current) {
		return nil, ErrConflict
	}
	out := make([]T, 0, len(items))
	seen := map[string]bool{}
	for _, id := range ids {
		i := slices.Index(current, id)
		if i < 0 || seen[id] {
			return nil, ErrConflict
		}
		seen[id] = true
		out = append(out, items[i])
	}
	return out, nil
}

func (c *Credits) applyPerson(op Op) error {
	ids := personIDs(c)
	switch op.Op {
	case OpCreate:
		c.People = append(c.People, Person{
			ID: newItemID("p", ids), Rev: 1, Name: "คนใหม่", Bg: newColors[len(c.People)%len(newColors)],
		})
		return nil
	case OpOrder:
		people, err := reorder(c.People, ids, op.IDs)
		if err != nil {
			return err
		}
		c.People = people
		return nil
	}
	i := slices.Index(ids, op.ID)
	if i < 0 || c.People[i].Rev != op.Rev {
		return ErrConflict
	}
	switch op.Op {
	case OpSave:
		if op.Person == nil {
			return ErrBadOp
		}
		p := *op.Person
		p.ID, p.Rev = op.ID, op.Rev+1
		c.People[i] = p
		return nil
	case OpDelete:
		for _, o := range c.Ocs {
			if o.Owner == op.ID || o.Artist == op.ID {
				return ErrInUse
			}
		}
		c.People = slices.Delete(c.People, i, i+1)
		// เอาออกจากทุกกลุ่มทีมด้วย กลุ่มที่เปลี่ยนได้เลขรุ่นใหม่
		for g := range c.Team {
			if j := slices.Index(c.Team[g].IDs, op.ID); j >= 0 {
				c.Team[g].IDs = slices.Delete(c.Team[g].IDs, j, j+1)
				c.Team[g].Rev++
			}
		}
		return nil
	}
	return ErrBadOp
}

func (c *Credits) applyGroup(op Op) error {
	ids := groupIDs(c)
	switch op.Op {
	case OpCreate:
		c.Team = append(c.Team, TeamGroup{
			ID: newItemID("g", ids), Rev: 1, Role: "กลุ่มใหม่", Bg: newColors[(len(c.Team)+4)%len(newColors)], IDs: []string{},
		})
		return nil
	case OpOrder:
		team, err := reorder(c.Team, ids, op.IDs)
		if err != nil {
			return err
		}
		c.Team = team
		return nil
	}
	i := slices.Index(ids, op.ID)
	if i < 0 || c.Team[i].Rev != op.Rev {
		return ErrConflict
	}
	switch op.Op {
	case OpSave:
		if op.Group == nil {
			return ErrBadOp
		}
		g := *op.Group
		g.ID, g.Rev = op.ID, op.Rev+1
		c.Team[i] = g
		return nil
	case OpDelete:
		c.Team = slices.Delete(c.Team, i, i+1)
		return nil
	}
	return ErrBadOp
}

func (c *Credits) applyOc(op Op) error {
	ids := ocIDs(c)
	switch op.Op {
	case OpCreate:
		if len(c.People) == 0 {
			return &FieldError{Field: "ocs.owner"} // ต้องมีคนอย่างน้อยหนึ่งคนให้เป็นเจ้าของ
		}
		colors := newOcColors[len(c.Ocs)%len(newOcColors)]
		c.Ocs = append(c.Ocs, Oc{
			ID: newItemID("oc", ids), Rev: 1, Name: "ตัวละครใหม่",
			Owner: c.People[0].ID, Artist: c.People[0].ID, Color: colors[0], Pale: colors[1],
		})
		return nil
	case OpOrder:
		ocs, err := reorder(c.Ocs, ids, op.IDs)
		if err != nil {
			return err
		}
		c.Ocs = ocs
		return nil
	}
	i := slices.Index(ids, op.ID)
	if i < 0 || c.Ocs[i].Rev != op.Rev {
		return ErrConflict
	}
	switch op.Op {
	case OpSave:
		if op.Oc == nil {
			return ErrBadOp
		}
		o := *op.Oc
		o.ID, o.Rev = op.ID, op.Rev+1
		// รูปเปลี่ยนได้ผ่านการอัปโหลดเท่านั้น (SetOcImage) ค่าที่ส่งมากับฟอร์มไม่ถูกใช้
		o.Image = c.Ocs[i].Image
		c.Ocs[i] = o
		return nil
	case OpDelete:
		c.Ocs = slices.Delete(c.Ocs, i, i+1)
		return nil
	}
	return ErrBadOp
}

// SetOcImage ตั้งหรือเอารูปของตัวละครออก (image ว่าง = ไม่มีรูป) ต้องส่งเลขรุ่นที่เห็นมาด้วยเหมือนการแก้อื่น
func (c *Credits) SetOcImage(id string, rev int, image string) error {
	i := slices.Index(ocIDs(c), id)
	if i < 0 || c.Ocs[i].Rev != rev {
		return ErrConflict
	}
	c.Ocs[i].Image = image
	c.Ocs[i].Rev++
	return c.Clean()
}

// ImageIDs คืนรหัสของรูปทั้งหมดที่ข้อมูลนี้ใช้อยู่
func (c *Credits) ImageIDs() []string {
	var out []string
	for _, o := range c.Ocs {
		if id, ok := strings.CutPrefix(o.Image, imagePathPrefix); ok && ValidImageID(id) {
			out = append(out, id)
		}
	}
	return out
}

// UnusedImages คืนรหัสรูปที่ before ใช้อยู่แต่ after ไม่ใช้แล้ว ซึ่งต้องลบออกจากที่เก็บ
func UnusedImages(before, after *Credits) []string {
	still := after.ImageIDs()
	var out []string
	for _, id := range before.ImageIDs() {
		if !slices.Contains(still, id) && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	return out
}

// Seed เตรียมข้อมูลตั้งต้น: ทุกรายการได้เลขรุ่น 1 กลุ่มที่ยังไม่มีรหัสได้รหัสใหม่ และยังไม่มีรูป
// (รูปใส่ได้ผ่านการอัปโหลดหลังตั้งต้นแล้วเท่านั้น จึงอ้างถึงรูปที่ไม่มีอยู่จริงไม่ได้)
func (c *Credits) Seed() error {
	for i := range c.People {
		c.People[i].Rev = 1
	}
	taken := []string{}
	for i := range c.Team {
		c.Team[i].Rev = 1
		if c.Team[i].ID == "" {
			c.Team[i].ID = newItemID("g", taken)
		}
		taken = append(taken, c.Team[i].ID)
	}
	for i := range c.Ocs {
		c.Ocs[i].Rev = 1
		if c.Ocs[i].Image != "" {
			return &FieldError{Field: "ocs[" + strconv.Itoa(i) + "].image"}
		}
	}
	return c.Clean()
}

// Clone คืนสำเนาที่แก้ได้โดยไม่กระทบต้นฉบับ
func (c *Credits) Clone() Credits {
	out := Credits{People: slices.Clone(c.People), Team: slices.Clone(c.Team), Ocs: slices.Clone(c.Ocs)}
	for i := range out.Team {
		out.Team[i].IDs = slices.Clone(out.Team[i].IDs)
	}
	return out
}
