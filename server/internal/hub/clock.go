package hub

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/game"
)

// TimeControl คือเวลาเล่นของเกม: เวลาเริ่มต้นต่อฝั่ง และเวลาที่บวกเพิ่มหลังเดินแต่ละตา
type TimeControl struct {
	Initial   time.Duration
	Increment time.Duration
}

// DefaultTimeControl คือ 10 นาที ไม่บวกเวลา
var DefaultTimeControl = TimeControl{Initial: 10 * time.Minute}

// ErrBadTimeControl คือรูปแบบเวลาเล่นที่ไม่รองรับ
var ErrBadTimeControl = errors.New("bad time control")

var timeControlRe = regexp.MustCompile(`^(\d{1,2})\+(\d{1,2})$`)

// ParseTimeControl อ่านรูปแบบ "นาที+วินาทีที่บวก" เช่น "5+3" หรือ "10+0"
// รับ 1–60 นาที และบวกได้ 0–60 วินาที
func ParseTimeControl(s string) (TimeControl, error) {
	m := timeControlRe.FindStringSubmatch(s)
	if m == nil {
		return TimeControl{}, ErrBadTimeControl
	}
	minutes, _ := strconv.Atoi(m[1])
	increment, _ := strconv.Atoi(m[2])
	if minutes < 1 || minutes > 60 || increment > 60 {
		return TimeControl{}, ErrBadTimeControl
	}
	return TimeControl{
		Initial:   time.Duration(minutes) * time.Minute,
		Increment: time.Duration(increment) * time.Second,
	}, nil
}

func (tc TimeControl) String() string {
	return fmt.Sprintf("%d+%d", int(tc.Initial/time.Minute), int(tc.Increment/time.Second))
}

// clock คือนาฬิกาหมากรุก เซิร์ฟเวอร์เป็นผู้นับเพียงผู้เดียว
// เวลาปัจจุบันถูกส่งเข้ามาทุกครั้ง นาฬิกาไม่อ่านเวลาเอง
type clock struct {
	tc        TimeControl
	remaining map[game.Color]time.Duration
	running   game.Color // "" = หยุด
	since     time.Time  // เวลาที่ฝั่ง running เริ่มเดิน
}

func newClock(tc TimeControl) *clock {
	return &clock{
		tc:        tc,
		remaining: map[game.Color]time.Duration{game.White: tc.Initial, game.Black: tc.Initial},
	}
}

// start เริ่มเดินนาฬิกาของฝั่ง c
func (k *clock) start(c game.Color, now time.Time) {
	k.running = c
	k.since = now
}

// left คืนเวลาที่เหลือของฝั่ง c ณ เวลา now (ไม่ต่ำกว่า 0)
func (k *clock) left(c game.Color, now time.Time) time.Duration {
	d := k.remaining[c]
	if k.running == c {
		d -= now.Sub(k.since)
	}
	return max(d, 0)
}

// flagAt คืนเวลาที่ฝั่งซึ่งกำลังเดินจะหมดเวลา
func (k *clock) flagAt() (time.Time, bool) {
	if k.running == "" {
		return time.Time{}, false
	}
	return k.since.Add(k.remaining[k.running]), true
}

// press คือการกดนาฬิกาหลังเดินหมาก: หักเวลาที่ใช้ บวก increment แล้วสลับฝั่ง
func (k *clock) press(now time.Time) {
	if k.running == "" {
		return
	}
	mover := k.running
	k.remaining[mover] = k.left(mover, now) + k.tc.Increment
	k.running = mover.Other()
	k.since = now
}

// stop หยุดนาฬิกาและตรึงเวลาที่เหลือไว้
func (k *clock) stop(now time.Time) {
	if k.running == "" {
		return
	}
	k.remaining[k.running] = k.left(k.running, now)
	k.running = ""
}
