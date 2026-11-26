-- ตารางหลักของ checkmate-live
-- ไม่ระบุชื่อ schema: ใช้ search_path ของ connection (ปกติคือ public; test ใช้ schema แยก)
-- Go server เป็นผู้อ่านเขียนเพียงผู้เดียว หน้าเว็บ (anon key) ต้องเข้าตารางเหล่านี้ไม่ได้

-- ห้องที่ยังเปิดอยู่ ใช้กู้คืนหลังเซิร์ฟเวอร์รีสตาร์ต
create table rooms (
    id           text primary key check (id ~ '^[a-z2-9]{12}$'),
    status       text not null check (status in ('waiting', 'playing', 'finished')),
    created_by   text not null default '',
    time_control text not null,
    snapshot     jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index rooms_status_idx on rooms (status);

-- เกมที่จบแล้ว หนึ่งห้องมีได้หนึ่งเกม
-- white_id / black_id เป็น null เมื่อผู้เล่นเป็น guest (ไม่มีบัญชีใน Supabase Auth)
create table games (
    id           uuid primary key default gen_random_uuid(),
    room_id      text not null unique,
    white_id     uuid references auth.users (id) on delete set null,
    black_id     uuid references auth.users (id) on delete set null,
    pgn          text not null,
    result       text not null check (result in ('1-0', '0-1', '1/2-1/2')),
    reason       text not null check (reason in ('checkmate', 'resign', 'timeout', 'draw', 'stalemate', 'abandon')),
    time_control text not null,
    started_at   timestamptz not null,
    ended_at     timestamptz not null
);

create index games_white_idx on games (white_id, ended_at desc);
create index games_black_idx on games (black_id, ended_at desc);

-- เปิด RLS โดยไม่มี policy = ปฏิเสธทุกอย่างสำหรับ role ที่ไม่ใช่เจ้าของตาราง
alter table rooms enable row level security;
alter table games enable row level security;

-- และถอนสิทธิ์ของ role ฝั่งเว็บออกด้วย เป็นการกันสองชั้น
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on rooms, games from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        revoke all on rooms, games from authenticated;
    end if;
end
$$;
