-- รหัสห้องเปลี่ยนเป็นตัวเลข 6 หลัก (100000–999999) ซึ่งถูกนำกลับมาใช้ใหม่ได้หลังห้องปิด
-- ตารางที่อ้างรหัสห้องจึงต้องไม่ถือว่ารหัสห้องไม่ซ้ำตลอดกาล

-- ห้องที่เปิดอยู่: รูปแบบรหัสใหม่
-- not valid = ไม่ตรวจแถวที่มีอยู่แล้ว (ห้องรหัสแบบเก่าที่ค้างอยู่ถูกปล่อยไว้ เซิร์ฟเวอร์ปิดห้องเหล่านั้นเองตามปกติ)
alter table rooms drop constraint rooms_id_check;
alter table rooms add constraint rooms_id_check check (id ~ '^[1-9][0-9]{5}$') not valid;

-- เกมที่จบแล้ว: เดิมหนึ่งรหัสห้องมีได้เกมเดียว เกมของห้องใหม่ที่ได้รหัสซ้ำกับเกมเก่าจึงไม่ถูกบันทึก
-- เปลี่ยนเป็นไม่ซ้ำตาม (รหัสห้อง, เวลาเริ่มเกม) ซึ่งยังกันการบันทึกเกมเดียวกันซ้ำสองครั้งได้เหมือนเดิม
alter table games drop constraint games_room_id_key;
alter table games add constraint games_room_started_key unique (room_id, started_at);

-- การรายงานแชท: เลขข้อความเริ่มนับใหม่ทุกห้อง จึงเพิ่มเวลาที่ส่งข้อความเข้าไปในเงื่อนไขไม่ซ้ำ
alter table chat_reports drop constraint chat_reports_room_id_message_id_reporter_id_key;
alter table chat_reports add constraint chat_reports_once_key unique (room_id, message_id, reporter_id, sent_at);
