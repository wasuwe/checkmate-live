-- เกมหลายชนิด: บันทึกว่าเกมที่จบแล้วเป็นเกมอะไร (เกมเดิมทั้งหมดคือหมากรุกสากล)
-- และเพิ่มเหตุผล 'count' = เสมอเพราะนับศักดิ์ครบ (หมากรุกไทย)
-- ชนิดของเกมของห้องที่ยังเปิดอยู่เก็บใน rooms.snapshot

alter table games
    add column variant text not null default 'chess' check (variant ~ '^[a-z]{1,20}$');

alter table games drop constraint games_reason_check;
alter table games
    add constraint games_reason_check
    check (reason in ('checkmate', 'resign', 'timeout', 'draw', 'stalemate', 'abandon', 'count'));
