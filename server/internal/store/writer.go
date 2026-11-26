package store

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// backend คือการเขียนลงฐานข้อมูลจริง แยกเป็น interface เพื่อให้ test ใส่ตัวปลอมได้
type backend interface {
	upsertRoom(ctx context.Context, snap hub.RoomSnapshot) error
	deleteRoom(ctx context.Context, id string) error
	insertGame(ctx context.Context, g hub.GameRecord) error
}

const (
	writeTimeout = 5 * time.Second
	retryMin     = time.Second
	retryMax     = 30 * time.Second
)

// roomOp คืองานล่าสุดของห้องหนึ่งห้อง: บันทึก snapshot หรือลบ
type roomOp struct {
	delete bool
	snap   hub.RoomSnapshot
}

// Writer รับงานเขียนจากห้องแล้วเขียนลงฐานข้อมูลเบื้องหลัง
//
// การเรียกจากห้องคืนทันทีเสมอ ฐานข้อมูลช้าหรือล่มจึงไม่ทำให้เกมค้าง
// งานที่เขียนไม่สำเร็จถูกเก็บไว้ลองใหม่ สำหรับห้องจะเก็บเฉพาะสถานะล่าสุด
// (สถานะเก่าไม่มีประโยชน์แล้ว) ส่วนเกมที่จบแล้วเก็บไว้ทุกเกมจนกว่าจะเขียนได้
type Writer struct {
	db  backend
	log *slog.Logger

	mu     sync.Mutex
	rooms  map[string]roomOp
	games  []hub.GameRecord
	closed bool

	wake chan struct{}
	stop chan struct{}
	done chan struct{}
}

// NewWriter เริ่ม goroutine สำหรับเขียนลง s
func NewWriter(s *Store, log *slog.Logger) *Writer {
	return newWriter(s, log)
}

func newWriter(db backend, log *slog.Logger) *Writer {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	w := &Writer{
		db:    db,
		log:   log,
		rooms: map[string]roomOp{},
		wake:  make(chan struct{}, 1),
		stop:  make(chan struct{}),
		done:  make(chan struct{}),
	}
	go w.loop()
	return w
}

// SaveRoom เข้าคิวบันทึกสถานะล่าสุดของห้อง
func (w *Writer) SaveRoom(snap hub.RoomSnapshot) {
	w.enqueue(func() { w.rooms[snap.ID] = roomOp{snap: snap} })
}

// DeleteRoom เข้าคิวลบห้อง
func (w *Writer) DeleteRoom(id string) {
	w.enqueue(func() { w.rooms[id] = roomOp{delete: true} })
}

// SaveGame เข้าคิวบันทึกเกมที่จบแล้ว
func (w *Writer) SaveGame(g hub.GameRecord) {
	w.enqueue(func() { w.games = append(w.games, g) })
}

func (w *Writer) enqueue(add func()) {
	w.mu.Lock()
	if !w.closed {
		add()
	}
	w.mu.Unlock()
	select {
	case w.wake <- struct{}{}:
	default: // มีสัญญาณค้างอยู่แล้ว
	}
}

// Close หยุดรับงานใหม่และพยายามเขียนงานที่ค้างให้หมดก่อน ctx หมดเวลา
// คืนจำนวนงานที่เขียนไม่ทัน
func (w *Writer) Close(ctx context.Context) int {
	w.mu.Lock()
	w.closed = true
	w.mu.Unlock()
	close(w.stop)
	<-w.done

	for {
		if w.flush(ctx) || ctx.Err() != nil {
			break
		}
		select {
		case <-ctx.Done():
		case <-time.After(200 * time.Millisecond):
		}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.rooms) + len(w.games)
}

func (w *Writer) loop() {
	defer close(w.done)
	delay := retryMin
	for {
		select {
		case <-w.stop:
			return
		case <-w.wake:
		}
		// เขียนจนหมด ถ้าไม่สำเร็จให้รอแล้วลองใหม่ โดยเพิ่มเวลารอทีละเท่าตัว
		for !w.flush(context.Background()) {
			select {
			case <-w.stop:
				return
			case <-time.After(delay):
			}
			delay = min(delay*2, retryMax)
		}
		delay = retryMin
	}
}

// flush เขียนงานที่ค้างทั้งหมดหนึ่งรอบ คืน true ถ้าไม่เหลืองานค้าง
func (w *Writer) flush(ctx context.Context) bool {
	w.mu.Lock()
	rooms, games := w.rooms, w.games
	w.rooms, w.games = map[string]roomOp{}, nil
	w.mu.Unlock()

	var failedGames []hub.GameRecord
	for _, g := range games {
		if err := w.write(ctx, func(ctx context.Context) error { return w.db.insertGame(ctx, g) }); err != nil {
			w.log.Error("save game failed, will retry", "room", g.RoomID, "err", err)
			failedGames = append(failedGames, g)
		}
	}

	failedRooms := map[string]roomOp{}
	for id, op := range rooms {
		err := w.write(ctx, func(ctx context.Context) error {
			if op.delete {
				return w.db.deleteRoom(ctx, id)
			}
			return w.db.upsertRoom(ctx, op.snap)
		})
		if err != nil {
			w.log.Error("save room failed, will retry", "room", id, "err", err)
			failedRooms[id] = op
		}
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	// งานที่ล้มเหลวกลับเข้าคิว เว้นแต่มีงานใหม่กว่าของห้องเดียวกันเข้ามาระหว่างนั้น
	for id, op := range failedRooms {
		if _, newer := w.rooms[id]; !newer {
			w.rooms[id] = op
		}
	}
	w.games = append(failedGames, w.games...)
	return len(w.rooms) == 0 && len(w.games) == 0
}

func (w *Writer) write(ctx context.Context, fn func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return fn(ctx)
}
