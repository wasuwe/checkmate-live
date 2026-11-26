-- หมากฮอส: เหตุผลการจบเกมเพิ่มอีกสองแบบ
--   wipeout = ฝ่ายแพ้ถูกกินหมดกระดาน, blocked = ฝ่ายแพ้ยังมีหมากแต่ไม่มีตาเดิน

alter table games drop constraint games_reason_check;
alter table games
    add constraint games_reason_check
    check (reason in ('checkmate', 'resign', 'timeout', 'draw', 'stalemate', 'abandon', 'count', 'wipeout', 'blocked'));
