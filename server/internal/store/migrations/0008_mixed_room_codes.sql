-- รหัสห้องเปลี่ยนเป็นตัวอักษรผสมตัวเลข 6 ตัว (ไม่มี 0 O 1 I L) เพื่อให้เดายากขึ้น
-- ยังรับรหัสตัวเลข 6 หลักแบบเดิม ให้ห้องที่เปิดค้างก่อนเปลี่ยนบันทึกต่อได้จนปิดไปเอง
-- not valid = ไม่ตรวจแถวที่มีอยู่แล้ว (แบบเดียวกับ 0007)
alter table rooms drop constraint rooms_id_check;
alter table rooms add constraint rooms_id_check check (id ~ '^([A-HJKMNP-Z2-9]{6}|[1-9][0-9]{5})$') not valid;
