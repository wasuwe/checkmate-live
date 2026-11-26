package store

import (
	"context"
	"log/slog"
	"sync"

	"github.com/wasuwe/checkmate-live/server/internal/hub"
)

// reportQueueSize คือจำนวนการรายงานที่รอเขียนได้ ถ้าเต็ม (ฐานข้อมูลล่มนานหรือถูกสแปม) รายการใหม่จะถูกทิ้ง
// การรายงานยังอยู่ใน log ของเซิร์ฟเวอร์เสมอ และห้องจำกัดความถี่ต่อผู้ใช้อยู่แล้ว
const reportQueueSize = 256

// ReportSink เขียนการรายงานแชทลงฐานข้อมูลเบื้องหลัง
type ReportSink struct {
	insert func(ctx context.Context, r hub.ChatReport) error
	log    *slog.Logger
	queue  chan hub.ChatReport
	done   chan struct{}
	once   sync.Once
}

// NewReportSink เริ่ม goroutine สำหรับเขียนลง s
func NewReportSink(s *Store, log *slog.Logger) *ReportSink {
	return newReportSink(s.insertReport, log)
}

func newReportSink(insert func(context.Context, hub.ChatReport) error, log *slog.Logger) *ReportSink {
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	k := &ReportSink{insert: insert, log: log, queue: make(chan hub.ChatReport, reportQueueSize), done: make(chan struct{})}
	go func() {
		defer close(k.done)
		for r := range k.queue {
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := k.insert(ctx, r)
			cancel()
			if err != nil {
				k.log.Error("save chat report failed", "room", r.RoomID, "message", r.MessageID, "err", err)
			}
		}
	}()
	return k
}

// Report เข้าคิวบันทึกการรายงาน คืนทันทีเสมอ ใช้เป็น hub.Config.OnReport ได้
// ต้องไม่ถูกเรียกหลัง Close (ปิด Hub ก่อนเสมอ)
func (k *ReportSink) Report(r hub.ChatReport) {
	select {
	case k.queue <- r:
	default:
		k.log.Warn("chat report dropped: queue full", "room", r.RoomID, "message", r.MessageID)
	}
}

// Close เขียนรายการที่ค้างให้หมดแล้วหยุด
func (k *ReportSink) Close() {
	k.once.Do(func() { close(k.queue) })
	<-k.done
}

// insertReport บันทึกการรายงาน รายงานซ้ำ (คนเดิม ข้อความเดิม) ไม่เกิดแถวใหม่
func (s *Store) insertReport(ctx context.Context, r hub.ChatReport) error {
	_, err := s.pool.Exec(ctx, `
		insert into chat_reports (room_id, message_id, message, sender_id, reporter_id, sent_at, reported_at)
		values ($1, $2, $3, $4, $5, $6, $7)
		on conflict (room_id, message_id, reporter_id, sent_at) do nothing`,
		r.RoomID, r.MessageID, r.Text, r.SenderID, r.ReporterID, r.SentAt, r.ReportedAt)
	return err
}
