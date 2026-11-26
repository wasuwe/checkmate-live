-- ชื่อที่แสดงและรูปโปรไฟล์ของผู้ใช้ที่ login
-- user_id คือ id ของบัญชีใน Supabase Auth (ค่า sub ใน JWT ที่ Go server ตรวจแล้ว)
-- ไม่ผูก foreign key กับ auth.users เพื่อให้ schema นี้ใช้กับฐานข้อมูลทดสอบที่ไม่มีบัญชีจริงได้
-- รูปถูกย่อและเข้ารหัสใหม่โดย Go server ก่อนเก็บ ขนาดจึงเล็ก (ไม่กี่สิบ KB)

create table profiles (
    user_id      uuid primary key,
    display_name text not null default '' check (char_length(display_name) <= 20),
    avatar_id    text unique check (avatar_id ~ '^[0-9a-f]{32}$'),
    avatar       bytea check (octet_length(avatar) <= 1048576),
    avatar_type  text check (avatar_type in ('image/jpeg', 'image/png')),
    updated_at   timestamptz not null default now(),
    -- มีรูปต้องมีครบทั้งสามค่า ไม่มีรูปต้องว่างทั้งสามค่า
    check ((avatar_id is null) = (avatar is null) and (avatar_id is null) = (avatar_type is null))
);

alter table profiles enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on profiles from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        revoke all on profiles from authenticated;
    end if;
end
$$;
