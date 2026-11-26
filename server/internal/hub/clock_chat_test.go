package hub

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

func (f *fakeClient) chat(r *Room, text string) {
	r.post(event{kind: evChat, client: f.Client, text: text})
}

func isChat(m serverMsg) bool { return m.Type == "chat" }

// lastState คืน state ล่าสุดจากข้อความที่ค้างอยู่
func (f *fakeClient) lastState() serverMsg {
	f.t.Helper()
	msgs := f.drain()
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Type == "state" {
			return msgs[i]
		}
	}
	f.t.Fatalf("%s: no state message in %+v", f.UserID, msgs)
	return serverMsg{}
}

// ---------- เวลาเล่น ----------

func TestParseTimeControl(t *testing.T) {
	valid := map[string]TimeControl{
		"5+3":   {Initial: 5 * time.Minute, Increment: 3 * time.Second},
		"10+0":  {Initial: 10 * time.Minute},
		"15+10": {Initial: 15 * time.Minute, Increment: 10 * time.Second},
		"1+0":   {Initial: time.Minute},
		"60+60": {Initial: time.Hour, Increment: time.Minute},
	}
	for s, want := range valid {
		got, err := ParseTimeControl(s)
		if err != nil || got != want {
			t.Errorf("%q: got %+v, %v; want %+v", s, got, err, want)
		}
		if got.String() != s {
			t.Errorf("%q: String() = %q", s, got.String())
		}
	}
	for _, s := range []string{"", "10", "0+0", "61+0", "5+61", "-5+3", "5+-3", "5 + 3", "5+3 ", "abc", "999+0", "5+3+1", "5.5+0"} {
		if _, err := ParseTimeControl(s); !errors.Is(err, ErrBadTimeControl) {
			t.Errorf("%q: err = %v, want ErrBadTimeControl", s, err)
		}
	}
}

func TestClockArithmetic(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	k := newClock(TimeControl{Initial: time.Minute, Increment: 5 * time.Second})

	if _, ok := k.flagAt(); ok {
		t.Fatal("stopped clock must not have a flag time")
	}
	if got := k.left(game.White, t0.Add(time.Hour)); got != time.Minute {
		t.Fatalf("stopped clock lost time: %v", got)
	}

	k.start(game.White, t0)
	if flag, _ := k.flagAt(); !flag.Equal(t0.Add(time.Minute)) {
		t.Fatalf("flagAt = %v", flag)
	}
	if got := k.left(game.White, t0.Add(10*time.Second)); got != 50*time.Second {
		t.Fatalf("white left = %v, want 50s", got)
	}
	if got := k.left(game.Black, t0.Add(10*time.Second)); got != time.Minute {
		t.Fatalf("black must not lose time on white's turn: %v", got)
	}

	k.press(t0.Add(10 * time.Second)) // ขาวใช้ 10 วิ ได้คืน 5 วิ
	if k.running != game.Black || k.remaining[game.White] != 55*time.Second {
		t.Fatalf("after press: running=%q white=%v", k.running, k.remaining[game.White])
	}
	if got := k.left(game.Black, t0.Add(5*time.Hour)); got != 0 {
		t.Fatalf("left must not go below zero: %v", got)
	}

	k.stop(t0.Add(30 * time.Second)) // ดำใช้ไป 20 วิ
	if k.running != "" || k.remaining[game.Black] != 40*time.Second {
		t.Fatalf("after stop: running=%q black=%v", k.running, k.remaining[game.Black])
	}
	k.press(t0.Add(time.Hour)) // กดตอนหยุดแล้วต้องไม่มีผล
	if k.remaining[game.Black] != 40*time.Second || k.remaining[game.White] != 55*time.Second {
		t.Fatal("press on a stopped clock changed the time")
	}
}

func TestClockInState(t *testing.T) {
	h := newTestHub(t, Config{})
	id, _ := h.CreateRoom(TimeControl{Initial: 5 * time.Minute, Increment: 3 * time.Second})
	r := h.room(id)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")

	alice.join(r)
	waiting := alice.untilState("waiting", isStatus(StatusWaiting))
	if waiting.TC != "5+3" || waiting.Clock != (clockInfo{White: 300_000, Black: 300_000}) {
		t.Fatalf("waiting: tc=%q clock=%+v, want 5+3 with a stopped clock", waiting.TC, waiting.Clock)
	}

	bob.join(r)
	playing := alice.untilState("playing", isStatus(StatusPlaying))
	if playing.Clock.Running != game.White {
		t.Fatalf("white's clock should run when the game starts: %+v", playing.Clock)
	}

	alice.resign(r)
	final := bob.untilState("finished", isStatus(StatusFinished))
	if final.Clock.Running != "" {
		t.Fatalf("clock still running after the game ended: %+v", final.Clock)
	}
}

func TestDefaultTimeControl(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)
	if st := alice.next(); st.TC != "10+0" || st.Clock.White != 600_000 {
		t.Fatalf("default: tc=%q clock=%+v", st.TC, st.Clock)
	}
}

// startTimedGame ใช้ใน synctest: เปิดเกมและทิ้งข้อความช่วงเริ่ม
func startTimedGame(t *testing.T, tc TimeControl) (r *Room, alice, bob *fakeClient) {
	t.Helper()
	h := newTestHub(t, Config{AbandonGrace: 24 * time.Hour})
	id, err := h.CreateRoom(tc)
	if err != nil {
		t.Fatal(err)
	}
	r = h.room(id)
	alice, bob = newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	synctest.Wait()
	bob.join(r)
	synctest.Wait()
	alice.drain()
	bob.drain()
	return r, alice, bob
}

func TestTimeoutLosesExactlyWhenClockRunsOut(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		r, alice, bob := startTimedGame(t, TimeControl{Initial: time.Minute})
		_ = r

		time.Sleep(59 * time.Second)
		synctest.Wait()
		if msgs := alice.drain(); len(msgs) != 0 {
			t.Fatalf("game changed before the clock ran out: %+v", msgs)
		}

		time.Sleep(time.Second)
		synctest.Wait()
		for _, c := range []*fakeClient{alice, bob} {
			msgs := c.drain()
			if len(msgs) != 2 || msgs[0].Type != "game_over" || msgs[0].Result != "0-1" || msgs[0].Reason != game.ReasonTimeout {
				t.Fatalf("%s: want game_over 0-1 by timeout, got %+v", c.UserID, msgs)
			}
			if st := msgs[1]; st.Clock.White != 0 || st.Clock.Black != 60_000 || st.Clock.Running != "" {
				t.Fatalf("%s: final clock = %+v", c.UserID, st.Clock)
			}
		}
	})
}

func TestMoveDeductsTimeAndAddsIncrement(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		r, alice, bob := startTimedGame(t, TimeControl{Initial: time.Minute, Increment: 5 * time.Second})

		time.Sleep(10 * time.Second)
		alice.move(r, 0, "e2e4")
		synctest.Wait()
		st := bob.lastState()
		if st.Clock != (clockInfo{White: 55_000, Black: 60_000, Running: game.Black}) {
			t.Fatalf("after white's move: %+v, want w=55s b=60s running b", st.Clock)
		}

		time.Sleep(20 * time.Second)
		bob.move(r, 1, "e7e5")
		synctest.Wait()
		st = alice.lastState()
		if st.Clock != (clockInfo{White: 55_000, Black: 45_000, Running: game.White}) {
			t.Fatalf("after black's move: %+v, want w=55s b=45s running w", st.Clock)
		}

		// ตาเดินผิดกติกาไม่กดนาฬิกา
		time.Sleep(5 * time.Second)
		alice.move(r, 2, "e4e6")
		synctest.Wait()
		alice.drain()
		carol := newFakeClient(t, "carol")
		carol.join(r)
		synctest.Wait()
		if st := carol.lastState(); st.Clock != (clockInfo{White: 50_000, Black: 45_000, Running: game.White}) {
			t.Fatalf("after an illegal move: %+v, want white still running at 50s", st.Clock)
		}
	})
}

func TestBlackTimesOut(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		r, alice, bob := startTimedGame(t, TimeControl{Initial: time.Minute})
		alice.move(r, 0, "e2e4")
		synctest.Wait()
		bob.drain()

		time.Sleep(time.Minute)
		synctest.Wait()
		msgs := bob.drain()
		if len(msgs) == 0 || msgs[0].Type != "game_over" || msgs[0].Result != "1-0" || msgs[0].Reason != game.ReasonTimeout {
			t.Fatalf("want game_over 1-0 by timeout, got %+v", msgs)
		}
	})
}

func TestClockStopsWhileWaitingForOpponent(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		h := newTestHub(t, Config{IdleTTL: 24 * time.Hour})
		id, _ := h.CreateRoom(TimeControl{Initial: time.Minute})
		r := h.room(id)
		alice := newFakeClient(t, "alice")
		alice.join(r)
		synctest.Wait()
		alice.drain()

		time.Sleep(time.Hour) // รอคู่แข่งนานแค่ไหนก็ไม่เสียเวลา
		bob := newFakeClient(t, "bob")
		bob.join(r)
		synctest.Wait()
		if st := bob.lastState(); st.Status != StatusPlaying || st.Clock.White != 60_000 {
			t.Fatalf("state after a long wait = %+v", st)
		}
	})
}

// ---------- แชท ----------

func TestCleanChatText(t *testing.T) {
	ok := map[string]string{
		"gg":                              "gg",
		"  สวัสดี  ":                      "สวัสดี",
		"<b>hi</b>":                       "<b>hi</b>", // เก็บตามจริง ฝั่งเว็บแสดงเป็น text
		"เดินดีมาก 👍":                     "เดินดีมาก 👍",
		strings.Repeat("ก", chatMaxRunes): strings.Repeat("ก", chatMaxRunes),
	}
	for in, want := range ok {
		if got, valid := cleanChatText(in); !valid || got != want {
			t.Errorf("%q: got %q, %v", in, got, valid)
		}
	}
	bad := []string{
		"", "   ", "\n\t",
		strings.Repeat("ก", chatMaxRunes+1),
		"line1\nline2",
		"bell\x07",
		"null\x00byte",
		"rtl‮override",
		"zero​width",
		"\xff\xfe",
	}
	for _, in := range bad {
		if got, valid := cleanChatText(in); valid {
			t.Errorf("%q: accepted as %q", in, got)
		}
	}
}

func TestDecodeChat(t *testing.T) {
	m, err := decodeInbound([]byte(`{"type":"chat","text":"  gg  "}`))
	if err != nil || m.Text != "gg" {
		t.Fatalf("decode chat: %+v, %v", m, err)
	}
	for _, s := range []string{
		`{"type":"chat"}`,
		`{"type":"chat","text":""}`,
		`{"type":"chat","text":"hi","from":"w"}`,
		`{"type":"chat","text":"a\nb"}`,
		`{"type":"chat","text":123}`,
	} {
		if _, err := decodeInbound([]byte(s)); !errors.Is(err, errBadMessage) {
			t.Errorf("%s: err = %v, want errBadMessage", s, err)
		}
	}
}

func TestChatBroadcast(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	carol := newFakeClient(t, "carol")
	carol.join(r)

	alice.chat(r, "สู้ ๆ")
	mine := alice.until("own chat", isChat)
	if !mine.Mine || mine.From != game.White || mine.Text != "สู้ ๆ" || mine.ID != 1 {
		t.Fatalf("sender got %+v", mine)
	}
	for _, c := range []*fakeClient{bob, carol} {
		got := c.until("chat", isChat)
		if got.Mine || got.From != game.White || got.Text != "สู้ ๆ" {
			t.Fatalf("%s got %+v", c.UserID, got)
		}
	}

	carol.chat(r, "ดูอยู่นะ")
	if got := alice.until("spectator chat", isChat); got.From != "" || got.ID != 2 || got.Mine {
		t.Fatalf("spectator message: %+v", got)
	}
}

func TestChatFromSecondTabIsMine(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, _ := startGame(t, h)
	tab2 := newFakeClient(t, "alice")
	tab2.join(r)

	alice.chat(r, "hi")
	if got := tab2.until("chat", isChat); !got.Mine {
		t.Fatalf("the sender's other tab should see the message as its own: %+v", got)
	}
}

func TestChatHistoryOnJoin(t *testing.T) {
	h := newTestHub(t, Config{})
	r, alice, bob := startGame(t, h)
	alice.chat(r, "one")
	bob.until("first chat", isChat)
	bob.chat(r, "two")
	alice.until("second chat", func(m serverMsg) bool { return isChat(m) && m.ID == 2 })

	// bob กลับเข้ามาใหม่ ต้องได้ประวัติก่อน state
	bob2 := newFakeClient(t, "bob")
	bob2.join(r)
	hist := bob2.next()
	if hist.Type != "chat_history" || len(hist.Messages) != 2 {
		t.Fatalf("first message after join = %+v, want chat_history with 2 messages", hist)
	}
	if m := hist.Messages[0]; m.Text != "one" || m.Mine || m.From != game.White {
		t.Fatalf("history[0] = %+v", m)
	}
	if m := hist.Messages[1]; m.Text != "two" || !m.Mine || m.From != game.Black {
		t.Fatalf("history[1] = %+v", m)
	}
	if st := bob2.next(); st.Type != "state" {
		t.Fatalf("expected state after history, got %+v", st)
	}
}

func TestNoChatHistoryWhenEmpty(t *testing.T) {
	h := newTestHub(t, Config{})
	r := newTestRoom(t, h)
	alice := newFakeClient(t, "alice")
	alice.join(r)
	if m := alice.next(); m.Type != "state" {
		t.Fatalf("first message = %+v, want state", m)
	}
}

func TestChatRateLimitAndHistoryCap(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		r, alice, bob := startTimedGame(t, TimeControl{Initial: time.Hour})

		// ส่งรัว: ผ่านได้ chatBurst ข้อความ ที่เหลือถูกปฏิเสธ
		for i := range chatBurst + 3 {
			alice.chat(r, fmt.Sprintf("spam %d", i))
		}
		synctest.Wait()
		var chats, limited int
		for _, m := range alice.drain() {
			switch {
			case m.Type == "chat":
				chats++
			case m.Type == "error" && m.Code == errCodeChatRateLimited:
				limited++
			}
		}
		if chats != chatBurst || limited != 3 {
			t.Fatalf("chats=%d limited=%d, want %d and 3", chats, limited, chatBurst)
		}
		if got := len(bob.drain()); got != chatBurst {
			t.Fatalf("bob received %d messages, want %d", got, chatBurst)
		}

		// โควตาเป็นของแต่ละคน: bob ยังส่งได้
		bob.chat(r, "ใจเย็น")
		synctest.Wait()
		if msgs := bob.drain(); len(msgs) != 1 || msgs[0].Type != "chat" {
			t.Fatalf("bob's own message: %+v", msgs)
		}
		alice.drain()

		// รอแล้วส่งได้อีก
		time.Sleep(chatInterval)
		alice.chat(r, "ขอโทษ")
		synctest.Wait()
		if msgs := alice.drain(); len(msgs) != 1 || msgs[0].Type != "chat" {
			t.Fatalf("after waiting: %+v", msgs)
		}

		// ส่งช้า ๆ จนเกินขนาดประวัติ แล้วดูว่าคนเข้าใหม่ได้เฉพาะข้อความล่าสุด
		for i := range chatHistory + 10 {
			time.Sleep(chatInterval)
			alice.chat(r, fmt.Sprintf("msg %d", i))
			synctest.Wait()
			alice.drain()
			bob.drain()
		}
		carol := newFakeClient(t, "carol")
		carol.join(r)
		synctest.Wait()
		hist := carol.drain()[0]
		if hist.Type != "chat_history" || len(hist.Messages) != chatHistory {
			t.Fatalf("history has %d messages, want %d", len(hist.Messages), chatHistory)
		}
		if last := hist.Messages[chatHistory-1]; last.Text != fmt.Sprintf("msg %d", chatHistory+9) {
			t.Fatalf("last history message = %q", last.Text)
		}
	})
}

func TestClockDoesNotRunBeforeItsStartTime(t *testing.T) {
	t0 := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	k := newClock(TimeControl{Initial: 5 * time.Minute, Increment: 3 * time.Second})
	k.start(game.White, t0.Add(3*time.Second)) // เริ่มนับในอีก 3 วินาที

	if got := k.left(game.White, t0.Add(2*time.Second)); got != 5*time.Minute {
		t.Fatalf("time left during the delay = %v, want the full 5m", got)
	}
	if got := k.delay(t0.Add(2 * time.Second)); got != time.Second {
		t.Fatalf("delay = %v, want 1s", got)
	}
	if got := k.left(game.White, t0.Add(13*time.Second)); got != 5*time.Minute-10*time.Second {
		t.Fatalf("time left 10s after the start = %v", got)
	}
	if got := k.delay(t0.Add(13 * time.Second)); got != 0 {
		t.Fatalf("delay after the start = %v, want 0", got)
	}
	if flag, ok := k.flagAt(); !ok || !flag.Equal(t0.Add(3*time.Second+5*time.Minute)) {
		t.Fatalf("flag time = %v, want the start time plus 5m", flag)
	}

	// เดินก่อนเหรียญตกถึงพื้น: ไม่เสียเวลา ได้ increment ตามปกติ และนาฬิกาอีกฝั่งเริ่มนับทันที
	k.press(t0.Add(time.Second))
	if got := k.left(game.White, t0.Add(time.Minute)); got != 5*time.Minute+3*time.Second {
		t.Fatalf("white after an early move = %v", got)
	}
	if k.running != game.Black || k.delay(t0.Add(time.Second)) != 0 {
		t.Fatalf("after an early move: running=%q delay=%v", k.running, k.delay(t0.Add(time.Second)))
	}
}

func TestStartDelayInState(t *testing.T) {
	h := newTestHub(t, Config{StartDelay: 3 * time.Second})
	r := newTestRoom(t, h)
	alice, bob := newFakeClient(t, "alice"), newFakeClient(t, "bob")
	alice.join(r)
	waiting := alice.untilState("waiting", isStatus(StatusWaiting))
	if waiting.Clock.Delay != 0 {
		t.Fatalf("delay while waiting = %d", waiting.Clock.Delay)
	}
	bob.join(r)
	start := alice.untilState("playing", isStatus(StatusPlaying))
	if start.Clock.Running != game.White || start.Clock.Delay <= 2000 || start.Clock.Delay > 3000 {
		t.Fatalf("start clock = %+v, want white running with a delay of about 3000ms", start.Clock)
	}
	if start.Clock.White != DefaultTimeControl.Initial.Milliseconds() {
		t.Fatalf("white clock at the start = %d, want the full time", start.Clock.White)
	}

	// ไม่ตั้ง StartDelay = นับทันทีเหมือนเดิม
	plain := newTestRoom(t, newTestHub(t, Config{}))
	carol, dave := newFakeClient(t, "carol"), newFakeClient(t, "dave")
	carol.join(plain)
	dave.join(plain)
	if st := carol.untilState("playing", isStatus(StatusPlaying)); st.Clock.Delay != 0 {
		t.Fatalf("delay without StartDelay = %d", st.Clock.Delay)
	}
}
