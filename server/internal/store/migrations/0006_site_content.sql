-- เนื้อหาของเว็บที่ผู้ดูแล (admin) แก้ได้จากหน้าจัดการข้อมูล
-- ตอนนี้มีข้อมูลหน้าเครดิต (key = 'credits') เก็บเป็น JSON ทั้งชุด เพราะอ่านและเขียนทั้งชุดทุกครั้ง
-- Go server ตรวจรูปแบบของ JSON ทั้งตอนเขียนและตอนอ่าน
-- updated_by / uploaded_by คือ user ID ของ admin ที่ทำรายการ เก็บไว้ตรวจย้อนหลัง

create table site_content (
    key        text primary key check (key ~ '^[a-z_]{1,40}$'),
    data       jsonb not null check (octet_length(data::text) <= 1048576),
    updated_by text not null default '',
    updated_at timestamptz not null default now()
);

-- รูปตัวละครที่อัปโหลดผ่านหน้าจัดการ ถูกตรวจและเข้ารหัสใหม่โดย Go server ก่อนเก็บ
create table content_images (
    id           text primary key check (id ~ '^[0-9a-f]{32}$'),
    data         bytea not null check (octet_length(data) <= 8388608),
    content_type text not null check (content_type in ('image/jpeg', 'image/png')),
    uploaded_by  text not null default '',
    created_at   timestamptz not null default now()
);

alter table site_content enable row level security;
alter table content_images enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on site_content, content_images from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        revoke all on site_content, content_images from authenticated;
    end if;
end
$$;
