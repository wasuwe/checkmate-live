-- ข้อความแชทที่ถูกรายงาน สำหรับให้ผู้ดูแลตรวจย้อนหลัง
-- แชทปกติไม่ถูกบันทึก เนื้อความถูกเก็บเฉพาะเมื่อมีคนกดรายงานข้อความนั้น
-- sender_id / reporter_id เป็น user ID แบบข้อความ เพราะเป็นได้ทั้งบัญชี (uuid) และ guest ("guest_...")

create table chat_reports (
    id          bigint generated always as identity primary key,
    room_id     text not null,
    message_id  integer not null,
    message     text not null check (char_length(message) <= 200),
    sender_id   text not null,
    reporter_id text not null,
    sent_at     timestamptz not null,
    reported_at timestamptz not null default now(),
    -- คนเดียวรายงานข้อความเดียวกันซ้ำไม่ได้
    unique (room_id, message_id, reporter_id)
);

create index chat_reports_sender_idx on chat_reports (sender_id, reported_at desc);

alter table chat_reports enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on chat_reports from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        revoke all on chat_reports from authenticated;
    end if;
end
$$;
