package content

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"
)

const (
	imgA = "/api/content-images/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	imgB = "/api/content-images/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

func seeded(t *testing.T) Credits {
	t.Helper()
	c := validCredits()
	c.Ocs[0].Image = ""
	c.Team[0].ID = ""
	if err := c.Seed(); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSeed(t *testing.T) {
	c := seeded(t)
	if c.People[0].Rev != 1 || c.Team[0].Rev != 1 || c.Ocs[0].Rev != 1 || c.Team[0].ID != "g1" {
		t.Fatalf("seeded: %+v", c)
	}
	// ข้อมูลตั้งต้นอ้างถึงรูปไม่ได้ เพราะรูปยังไม่มีอยู่จริง
	withImage := validCredits()
	var field *FieldError
	if err := withImage.Seed(); !errors.As(err, &field) || field.Field != "ocs[0].image" {
		t.Fatalf("seed with an image: %v", err)
	}
}

func TestSaveBumpsTheRevisionAndRejectsStaleEdits(t *testing.T) {
	c := seeded(t)
	edit := c.People[0]
	edit.Name = "นกจริง"
	if err := c.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 1, Person: &edit}); err != nil {
		t.Fatal(err)
	}
	if c.People[0].Name != "นกจริง" || c.People[0].Rev != 2 {
		t.Fatalf("after save: %+v", c.People[0])
	}
	// คนที่ยังถือรุ่น 1 อยู่ (เปิดหน้าไว้ก่อน) บันทึกทับไม่ได้
	stale := c.Clone()
	other := c.People[0]
	other.Name = "ทับ"
	if err := stale.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 1, Person: &other}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale save: %v, want ErrConflict", err)
	}
	// ลบหรือแก้รายการที่ไม่มีแล้วก็เป็น conflict เช่นกัน
	if err := cp(c).Apply(Op{Op: OpSave, Kind: KindPeople, ID: "ghost", Rev: 1, Person: &other}); !errors.Is(err, ErrConflict) {
		t.Fatalf("save of a missing item: %v", err)
	}
	// รหัสและเลขรุ่นใน body ไม่ถูกเชื่อ: ใช้ของคำสั่งเสมอ
	sneaky := c.People[0]
	sneaky.ID, sneaky.Rev = "mew", 99
	if err := c.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 2, Person: &sneaky}); err != nil {
		t.Fatal(err)
	}
	if c.People[0].ID != "nok" || c.People[0].Rev != 3 || c.People[1].ID != "mew" {
		t.Fatalf("id or rev from the body was used: %+v", c.People)
	}
}

func TestEditingDifferentItemsDoesNotConflict(t *testing.T) {
	c := seeded(t)
	nok, mew := c.People[0], c.People[1]
	nok.Name, mew.Name = "A", "B"
	if err := c.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 1, Person: &nok}); err != nil {
		t.Fatal(err)
	}
	// อีกคนแก้ mew โดยถือรุ่น 1 ของ mew ซึ่งยังไม่มีใครแตะ
	if err := c.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "mew", Rev: 1, Person: &mew}); err != nil {
		t.Fatalf("saving another item: %v", err)
	}
	if c.People[0].Name != "A" || c.People[1].Name != "B" {
		t.Fatalf("both edits must be kept: %+v", c.People)
	}
}

func TestCreateDeleteAndOrder(t *testing.T) {
	c := seeded(t)
	for _, kind := range []string{KindPeople, KindTeam, KindOcs} {
		if err := c.Apply(Op{Op: OpCreate, Kind: kind}); err != nil {
			t.Fatalf("create %s: %v", kind, err)
		}
	}
	if len(c.People) != 3 || len(c.Team) != 2 || len(c.Ocs) != 2 {
		t.Fatalf("after create: %d %d %d", len(c.People), len(c.Team), len(c.Ocs))
	}
	added := c.People[2]
	if added.Rev != 1 || added.ID == "nok" || added.ID == "mew" || added.Name == "" {
		t.Fatalf("new person: %+v", added)
	}

	// จัดลำดับ: ต้องเป็นรายการเดียวกับที่มีอยู่
	if err := c.Apply(Op{Op: OpOrder, Kind: KindPeople, IDs: []string{added.ID, "nok", "mew"}}); err != nil {
		t.Fatal(err)
	}
	if got := personIDs(&c); !slices.Equal(got, []string{added.ID, "nok", "mew"}) {
		t.Fatalf("order = %v", got)
	}
	for name, ids := range map[string][]string{
		"missing":   {"nok", "mew"},
		"unknown":   {"nok", "mew", "ghost"},
		"duplicate": {"nok", "nok", "mew"},
	} {
		if err := cp(c).Apply(Op{Op: OpOrder, Kind: KindPeople, IDs: ids}); !errors.Is(err, ErrConflict) {
			t.Errorf("order with %s ids: %v, want ErrConflict", name, err)
		}
	}

	// คนที่ยังเป็นเจ้าของหรือผู้วาดลบไม่ได้
	if err := cp(c).Apply(Op{Op: OpDelete, Kind: KindPeople, ID: "mew", Rev: 1}); !errors.Is(err, ErrInUse) {
		t.Fatalf("delete an owner: %v, want ErrInUse", err)
	}
	// ลบคน: ถูกเอาออกจากกลุ่มทีมด้วย และกลุ่มนั้นได้เลขรุ่นใหม่
	grp := c.Team[0]
	grp.IDs = []string{"nok", added.ID}
	if err := c.Apply(Op{Op: OpSave, Kind: KindTeam, ID: grp.ID, Rev: 1, Group: &grp}); err != nil {
		t.Fatal(err)
	}
	if err := c.Apply(Op{Op: OpDelete, Kind: KindPeople, ID: added.ID, Rev: 1}); err != nil {
		t.Fatal(err)
	}
	if len(c.People) != 2 || !slices.Equal(c.Team[0].IDs, []string{"nok"}) || c.Team[0].Rev != 3 {
		t.Fatalf("after deleting a member: people=%d team=%+v", len(c.People), c.Team[0])
	}
	if err := cp(c).Apply(Op{Op: OpDelete, Kind: KindOcs, ID: "kaimuk", Rev: 5}); !errors.Is(err, ErrConflict) {
		t.Fatalf("delete with a stale rev: %v", err)
	}
	for _, op := range []Op{{Op: "nope", Kind: KindPeople, ID: "nok", Rev: 1}, {Op: OpSave, Kind: "nope"}, {Op: OpSave, Kind: KindOcs, ID: "kaimuk", Rev: 1}} {
		if err := cp(c).Apply(op); !errors.Is(err, ErrBadOp) {
			t.Errorf("op %+v: %v, want ErrBadOp", op, err)
		}
	}
	// ค่าที่บันทึกยังถูกตรวจเหมือนเดิม
	badLink := c.People[0]
	badLink.Link = "javascript:alert(1)"
	var field *FieldError
	if err := cp(c).Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 1, Person: &badLink}); !errors.As(err, &field) || field.Field != "people[0].link" {
		t.Fatalf("bad link through an op: %v", err)
	}
}

func TestImagesChangeOnlyThroughSetOcImage(t *testing.T) {
	c := seeded(t)
	if err := c.SetOcImage("kaimuk", 1, imgA); err != nil {
		t.Fatal(err)
	}
	if c.Ocs[0].Image != imgA || c.Ocs[0].Rev != 2 {
		t.Fatalf("after setting an image: %+v", c.Ocs[0])
	}
	// การบันทึกฟอร์มของตัวละครเปลี่ยนรูปไม่ได้ แม้จะส่งค่ารูปอื่นมา
	form := c.Ocs[0]
	form.Name, form.Image = "ชื่อใหม่", imgB
	if err := c.Apply(Op{Op: OpSave, Kind: KindOcs, ID: "kaimuk", Rev: 2, Oc: &form}); err != nil {
		t.Fatal(err)
	}
	if c.Ocs[0].Image != imgA || c.Ocs[0].Name != "ชื่อใหม่" {
		t.Fatalf("form save changed the image: %+v", c.Ocs[0])
	}
	if err := cp(c).SetOcImage("kaimuk", 1, imgB); !errors.Is(err, ErrConflict) {
		t.Fatalf("image with a stale rev: %v", err)
	}
	var field *FieldError
	if err := cp(c).SetOcImage("kaimuk", 3, "https://evil.example/x.png"); !errors.As(err, &field) {
		t.Fatalf("outside image: %v", err)
	}
}

func TestUnusedImages(t *testing.T) {
	before := seeded(t)
	_ = before.SetOcImage("kaimuk", 1, imgA)
	replaced := before.Clone()
	_ = replaced.SetOcImage("kaimuk", 2, imgB)
	removed := before.Clone()
	_ = removed.SetOcImage("kaimuk", 2, "")
	deleted := before.Clone()
	_ = deleted.Apply(Op{Op: OpDelete, Kind: KindOcs, ID: "kaimuk", Rev: 2})
	renamed := before.Clone()
	form := renamed.Ocs[0]
	form.Name = "อื่น"
	_ = renamed.Apply(Op{Op: OpSave, Kind: KindOcs, ID: "kaimuk", Rev: 2, Oc: &form})

	want := []string{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
	for name, after := range map[string]Credits{"replaced": replaced, "removed": removed, "character deleted": deleted} {
		if got := UnusedImages(&before, &after); !slices.Equal(got, want) {
			t.Errorf("%s: unused = %v, want %v", name, got, want)
		}
	}
	if got := UnusedImages(&before, &renamed); len(got) != 0 {
		t.Errorf("an edit that keeps the image must not delete it: %v", got)
	}
}

func TestMemoryStoreUpdates(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	if _, err := m.UpdateCredits(ctx, "a", func(*Credits) error { return nil }); !errors.Is(err, ErrNoCredits) {
		t.Fatalf("update before init: %v", err)
	}
	if err := m.InitCredits(ctx, seeded(t), "a"); err != nil {
		t.Fatal(err)
	}
	if err := m.InitCredits(ctx, seeded(t), "a"); !errors.Is(err, ErrExists) {
		t.Fatalf("second init: %v, want ErrExists", err)
	}

	// ตั้งรูป แล้วเปลี่ยนรูป: รูปเก่าต้องถูกลบจากที่เก็บ
	for _, id := range []string{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"} {
		_ = m.SaveImage(ctx, id, Image{ContentType: "image/png", Data: []byte{1}}, "a")
	}
	if _, err := m.UpdateCredits(ctx, "a", func(c *Credits) error { return c.SetOcImage("kaimuk", 1, imgA) }); err != nil {
		t.Fatal(err)
	}
	if _, err := m.UpdateCredits(ctx, "a", func(c *Credits) error { return c.SetOcImage("kaimuk", 2, imgB) }); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Image(ctx, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the replaced image is still stored: %v", err)
	}
	if _, err := m.Image(ctx, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"); err != nil {
		t.Fatalf("the current image is gone: %v", err)
	}

	// การแก้ที่ล้มเหลวต้องไม่เปลี่ยนอะไร รวมถึงไม่ลบรูป
	if _, err := m.UpdateCredits(ctx, "a", func(c *Credits) error {
		c.Ocs = nil
		return ErrConflict
	}); !errors.Is(err, ErrConflict) {
		t.Fatal(err)
	}
	got, _ := m.Credits(ctx)
	if len(got.Ocs) != 1 || got.Ocs[0].Image != imgB || m.ImageCount() != 1 {
		t.Fatalf("a failed update changed the store: %+v images=%d", got.Ocs, m.ImageCount())
	}
	// ลบตัวละคร: รูปของมันถูกลบด้วย
	if _, err := m.UpdateCredits(ctx, "a", func(c *Credits) error {
		return c.Apply(Op{Op: OpDelete, Kind: KindOcs, ID: "kaimuk", Rev: 3})
	}); err != nil {
		t.Fatal(err)
	}
	if m.ImageCount() != 0 {
		t.Fatalf("%d images left after deleting the character", m.ImageCount())
	}
}

// ผู้ดูแลหลายคนกดบันทึกรายการเดียวกันพร้อมกันโดยถือรุ่นเดียวกัน: สำเร็จได้คนเดียว ที่เหลือถูกปฏิเสธ
func TestConcurrentSavesOfOneItemLetExactlyOneThrough(t *testing.T) {
	ctx := context.Background()
	m := NewMemory()
	if err := m.InitCredits(ctx, seeded(t), "a"); err != nil {
		t.Fatal(err)
	}
	const editors = 20
	var wg sync.WaitGroup
	results := make([]error, editors)
	for i := range editors {
		wg.Go(func() {
			_, results[i] = m.UpdateCredits(ctx, "admin", func(c *Credits) error {
				p := c.People[0]
				p.Name = "ผู้แก้ " + string(rune('A'+i))
				return c.Apply(Op{Op: OpSave, Kind: KindPeople, ID: "nok", Rev: 1, Person: &p})
			})
		})
	}
	wg.Wait()
	ok, conflicts := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			ok++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected error: %v", err)
		}
	}
	if ok != 1 || conflicts != editors-1 {
		t.Fatalf("%d saves succeeded and %d were refused, want 1 and %d", ok, conflicts, editors-1)
	}
	got, _ := m.Credits(ctx)
	if got.People[0].Rev != 2 {
		t.Fatalf("rev = %d, want 2", got.People[0].Rev)
	}
}

// cp คืนสำเนาที่แก้ได้ ใช้ลองคำสั่งที่ควรถูกปฏิเสธโดยไม่กระทบข้อมูลหลักของ test
func cp(c Credits) *Credits {
	out := c.Clone()
	return &out
}
