package hub

import (
	"testing"
	"time"
)

// onDevice ตั้งรหัสเครื่องของ connection เหมือนที่ ws.go ทำก่อนส่งเข้าห้อง
func (f *fakeClient) onDevice(id string) *fakeClient {
	f.Device = id
	return f
}

func (f *fakeClient) takeover(r *Room) {
	r.post(event{kind: evTakeover, client: f.Client})
}

func (f *fakeClient) expectMoved() {
	f.t.Helper()
	f.until("moved", func(m serverMsg) bool { return m.Type == "moved" })
}

// เข้าห้องเดิมจากอีกเครื่อง: เครื่องใหม่ถูกถามว่าจะย้ายไหม เครื่องเดิมยังเล่นต่อได้จนกว่าจะย้าย
func TestSecondDeviceIsAskedAndCanTakeTheRoomOver(t *testing.T) {
	h := newTestHub(t, Config{AbandonGrace: time.Minute})
	r, alice, bob := startGame(t, h)
	// startGame ไม่ได้ตั้งรหัสเครื่อง จึงให้ alice ออกแล้วเข้าใหม่จากเครื่องที่มีรหัส
	alice.leave(r)
	laptop := newFakeClient(t, alice.UserID).onDevice("laptop-0001")
	laptop.join(r)
	first := laptop.untilState("laptop in the game", isStatus(StatusPlaying))
	if first.You.Elsewhere || first.You.Color != "w" {
		t.Fatalf("the only device must not be asked: %+v", first.You)
	}

	phone := newFakeClient(t, alice.UserID).onDevice("phone-00002")
	phone.join(r)
	asked := phone.untilState("phone state", isStatus(StatusPlaying))
	if !asked.You.Elsewhere || asked.You.Color != "w" {
		t.Fatalf("the second device must be asked, and keeps the seat: %+v", asked.You)
	}
	// เครื่องที่อยู่มาก่อนไม่ถูกถาม
	if still := laptop.untilState("laptop after the phone joined", isStatus(StatusPlaying)); still.You.Elsewhere {
		t.Fatal("the device that was there first must not be asked")
	}

	phone.takeover(r)
	laptop.expectMoved()
	done := phone.untilState("phone alone", func(m serverMsg) bool { return !m.You.Elsewhere })
	if done.You.Color != "w" || !done.Players["w"].Connected || done.Players["w"].GraceLeft != 0 {
		t.Fatalf("after the move the player is still seated and connected: you=%+v white=%+v", done.You, done.Players["w"])
	}
	// เครื่องเดิมออกจากห้องแล้ว: ไม่ได้ state อีก และถูกตัดการเชื่อมต่อในที่สุด
	phone.move(r, 0, "e2e4")
	bob.untilState("bob sees the move from the phone", func(m serverMsg) bool { return m.Ply == 1 })
	select {
	case <-laptop.kicked:
	case <-time.After(movedGrace + testTimeout):
		t.Fatal("the old device was never disconnected")
	}
	select {
	case b := <-laptop.send:
		t.Fatalf("the old device still gets room messages: %s", b)
	default:
	}
}

// แท็บที่สองของเครื่องเดิม และหน้าเว็บรุ่นเก่าที่ไม่ส่งรหัสเครื่อง ไม่ถูกถาม
func TestSameDeviceOrUnknownDeviceIsNotAsked(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	tab1 := newFakeClient(t, "alice").onDevice("laptop-0001")
	tab1.join(r)
	tab1.untilState("first tab", isStatus(StatusWaiting))

	tab2 := newFakeClient(t, "alice").onDevice("laptop-0001")
	tab2.join(r)
	if s := tab2.untilState("second tab", isStatus(StatusWaiting)); s.You.Elsewhere {
		t.Fatal("another tab on the same device must not be asked")
	}
	old := newFakeClient(t, "alice")
	old.join(r)
	if s := old.untilState("old web client", isStatus(StatusWaiting)); s.You.Elsewhere {
		t.Fatal("a client without a device id must not be asked")
	}
	// takeover จากแท็บของเครื่องเดียวกันไม่ทำให้แท็บอื่นของเครื่องนั้น หรือ connection ที่ไม่มีรหัสเครื่อง ออกจากห้อง
	tab2.takeover(r)
	bob := newFakeClient(t, "bob")
	bob.join(r)
	tab1.untilState("first tab still in the room", isStatus(StatusPlaying))
	old.untilState("old client still in the room", isStatus(StatusPlaying))
}

// เครื่องเดิมออกไปเองก่อนตอบ: เครื่องใหม่ไม่ต้องถูกถามอีก และคนอื่นย้ายเครื่องของเราไม่ได้
func TestTheQuestionGoesAwayWhenTheOtherDeviceLeaves(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	laptop := newFakeClient(t, "alice").onDevice("laptop-0001")
	laptop.join(r)
	phone := newFakeClient(t, "alice").onDevice("phone-00002")
	phone.join(r)
	phone.untilState("asked", func(m serverMsg) bool { return m.You.Elsewhere })

	// คนอื่นส่ง takeover: ไม่มีผลกับเครื่องของ alice
	bob := newFakeClient(t, "bob").onDevice("bobs-phone-1")
	bob.join(r)
	bob.takeover(r)
	phone.untilState("still asked after someone else's takeover", func(m serverMsg) bool {
		return m.You.Elsewhere && m.Status == StatusPlaying
	})

	laptop.leave(r)
	phone.untilState("not asked once the laptop is gone", func(m serverMsg) bool { return !m.You.Elsewhere })
}

func TestJoinDeviceIsValidated(t *testing.T) {
	good := []string{
		`{"type":"join","room":"K7Q2XM"}`,
		`{"type":"join","room":"K7Q2XM","device":"abcDEF12_-"}`,
		`{"type":"takeover"}`,
	}
	for _, raw := range good {
		if _, err := decodeInbound([]byte(raw)); err != nil {
			t.Errorf("%s: %v", raw, err)
		}
	}
	bad := []string{
		`{"type":"join","room":"K7Q2XM","device":"short"}`,
		`{"type":"join","room":"K7Q2XM","device":"has space in it"}`,
		`{"type":"takeover","device":"abcDEF12_-"}`,
		`{"type":"ping","device":"abcDEF12_-"}`,
	}
	for _, raw := range bad {
		if _, err := decodeInbound([]byte(raw)); err == nil {
			t.Errorf("%s: accepted", raw)
		}
	}
}
