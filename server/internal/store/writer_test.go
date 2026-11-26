package store

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// fakeDB คือฐานข้อมูลปลอมที่สั่งให้ล้มเหลวหรือค้างได้
type fakeDB struct {
	mu      sync.Mutex
	down    bool
	hang    chan struct{} // ถ้าไม่ nil การเขียนจะค้างจน channel ถูกปิด
	rooms   map[string]hub.RoomSnapshot
	games   []hub.GameRecord
	calls   int
	history []string
}

func newFakeDB() *fakeDB {
	return &fakeDB{rooms: map[string]hub.RoomSnapshot{}}
}

var errDown = errors.New("database is down")

func (d *fakeDB) do(ctx context.Context, what string, apply func()) error {
	d.mu.Lock()
	hang := d.hang
	d.mu.Unlock()
	if hang != nil {
		select {
		case <-hang:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	d.calls++
	if d.down {
		return errDown
	}
	d.history = append(d.history, what)
	apply()
	return nil
}

func (d *fakeDB) upsertRoom(ctx context.Context, snap hub.RoomSnapshot) error {
	return d.do(ctx, "room "+snap.ID, func() { d.rooms[snap.ID] = snap })
}

func (d *fakeDB) deleteRoom(ctx context.Context, id string) error {
	return d.do(ctx, "delete "+id, func() { delete(d.rooms, id) })
}

func (d *fakeDB) insertGame(ctx context.Context, g hub.GameRecord) error {
	return d.do(ctx, "game "+g.RoomID, func() { d.games = append(d.games, g) })
}

func (d *fakeDB) setDown(down bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.down = down
}

func (d *fakeDB) room(id string) (hub.RoomSnapshot, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	snap, ok := d.rooms[id]
	return snap, ok
}

func (d *fakeDB) gameIDs() []string {
	d.mu.Lock()
	defer d.mu.Unlock()
	ids := make([]string, len(d.games))
	for i, g := range d.games {
		ids[i] = g.RoomID
	}
	return ids
}

func snap(id string, moves ...string) hub.RoomSnapshot {
	return hub.RoomSnapshot{ID: id, Status: hub.StatusPlaying, TimeControl: "10+0", Moves: moves}
}

func closeWriter(t *testing.T, w *Writer) int {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return w.Close(ctx)
}

func TestWriterWritesEverything(t *testing.T) {
	db := newFakeDB()
	w := newWriter(db, nil)
	w.SaveRoom(snap("a", "e2e4"))
	w.SaveRoom(snap("b"))
	w.SaveGame(hub.GameRecord{RoomID: "a", Result: "1-0"})
	w.DeleteRoom("b")

	if left := closeWriter(t, w); left != 0 {
		t.Fatalf("%d jobs left after close", left)
	}
	if got, ok := db.room("a"); !ok || len(got.Moves) != 1 {
		t.Fatalf("room a = %+v, %v", got, ok)
	}
	if _, ok := db.room("b"); ok {
		t.Fatal("room b should have been deleted")
	}
	if ids := db.gameIDs(); len(ids) != 1 || ids[0] != "a" {
		t.Fatalf("games = %v", ids)
	}
}

func TestWriterKeepsOnlyLatestRoomState(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		db := newFakeDB()
		db.setDown(true)
		w := newWriter(db, nil)

		// ฐานข้อมูลล่มระหว่างที่เกมเดินไป 50 ตา
		for i := range 50 {
			w.SaveRoom(snap("a", make([]string, i+1)...))
		}
		synctest.Wait()
		db.setDown(false)
		time.Sleep(retryMax)
		synctest.Wait()

		got, ok := db.room("a")
		if !ok || len(got.Moves) != 50 {
			t.Fatalf("room after recovery has %d moves, want the latest (50)", len(got.Moves))
		}
		db.mu.Lock()
		writes := len(db.history)
		db.mu.Unlock()
		if writes != 1 {
			t.Fatalf("wrote %d times after recovery, want 1 (only the latest state)", writes)
		}
		closeWriter(t, w)
	})
}

func TestWriterRetriesGamesUntilSaved(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		db := newFakeDB()
		db.setDown(true)
		w := newWriter(db, nil)

		for i := range 3 {
			w.SaveGame(hub.GameRecord{RoomID: fmt.Sprintf("g%d", i)})
		}
		time.Sleep(10 * time.Minute) // ล่มนาน: ต้องลองซ้ำเรื่อย ๆ โดยไม่ทิ้งเกม
		synctest.Wait()
		if len(db.gameIDs()) != 0 {
			t.Fatal("games written while the database was down")
		}
		db.mu.Lock()
		attempts := db.calls
		db.mu.Unlock()
		// รอแบบเพิ่มเท่าตัวจนถึงเพดาน 30 วิ: 10 นาทีควรลองราว 20 กว่ารอบ ไม่ใช่หลายพันครั้ง
		if attempts < 3*10 || attempts > 3*40 {
			t.Fatalf("%d write attempts in 10 minutes; backoff is off", attempts)
		}

		db.setDown(false)
		time.Sleep(retryMax)
		synctest.Wait()
		ids := db.gameIDs()
		if len(ids) != 3 || ids[0] != "g0" || ids[1] != "g1" || ids[2] != "g2" {
			t.Fatalf("games after recovery = %v, want g0 g1 g2 in order", ids)
		}
		closeWriter(t, w)
	})
}

func TestWriterNewerStateBeatsFailedOlderState(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		db := newFakeDB()
		db.setDown(true)
		w := newWriter(db, nil)

		w.SaveRoom(snap("a", "e2e4"))
		synctest.Wait()   // ความพยายามแรกล้มเหลวและกำลังรอลองใหม่
		w.DeleteRoom("a") // ระหว่างนั้นห้องถูกปิด
		db.setDown(false)
		time.Sleep(retryMax)
		synctest.Wait()

		if _, ok := db.room("a"); ok {
			t.Fatal("stale snapshot was written after the room was deleted")
		}
		closeWriter(t, w)
	})
}

func TestWriterNeverBlocksCallers(t *testing.T) {
	db := newFakeDB()
	db.hang = make(chan struct{})
	w := newWriter(db, nil)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := range 10_000 {
			w.SaveRoom(snap("a", make([]string, i%7)...))
			w.SaveGame(hub.GameRecord{RoomID: fmt.Sprintf("g%d", i)})
		}
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("callers were blocked by a hanging database")
	}

	close(db.hang)
	if left := closeWriter(t, w); left != 0 {
		t.Fatalf("%d jobs left after the database recovered", left)
	}
	if got := len(db.gameIDs()); got != 10_000 {
		t.Fatalf("saved %d games, want 10000", got)
	}
}

func TestWriterCloseGivesUpAtDeadline(t *testing.T) {
	db := newFakeDB()
	db.setDown(true)
	w := newWriter(db, nil)
	w.SaveGame(hub.GameRecord{RoomID: "a"})
	w.SaveRoom(snap("a"))

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	start := time.Now()
	left := w.Close(ctx)
	if left != 2 {
		t.Fatalf("Close reported %d unsaved jobs, want 2", left)
	}
	if elapsed := time.Since(start); elapsed > 3*time.Second {
		t.Fatalf("Close took %v with the database down", elapsed)
	}

	// หลังปิดแล้วงานใหม่ถูกทิ้งเงียบ ๆ ไม่ panic
	w.SaveRoom(snap("b"))
	w.SaveGame(hub.GameRecord{RoomID: "b"})
}
