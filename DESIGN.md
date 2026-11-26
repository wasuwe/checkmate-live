# เกมหมากรุกสากลออนไลน์ — สรุปการออกแบบระบบ

เกมหมากรุกแบบ 2D เล่นบนเว็บ สร้างได้หลายห้อง แต่ละห้องมีผู้เล่น 2 คน และให้คนอื่นเข้าดูได้ ออกแบบให้เป็นระบบขนาดเล็ก ดูแลง่าย และขยายต่อได้

---

## 1. Tech Stack

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| Frontend | React + Vite | เร็ว ง่าย มีตัวอย่างและคนใช้เยอะ |
| กระดาน | `react-chessboard` (MIT) | ลากวางหมากได้ทันที license ไม่มีปัญหา |
| กติกาฝั่งหน้าเว็บ | `chess.js` | ใช้แค่ไฮไลต์ช่องที่เดินได้ |
| Backend | Go + `net/http` | binary ไฟล์เดียว ใช้ RAM น้อย deploy ง่าย |
| Realtime | `github.com/coder/websocket` | ใช้ context ได้ รองรับการเขียนพร้อมกัน ยังมีคนดูแล |
| กติกาฝั่งเซิร์ฟเวอร์ | `github.com/corentings/chess/v2` | ตรวจตาเดิน รุกจน PGN/FEN |
| Database | Supabase (PostgreSQL) | Postgres มาตรฐาน พร้อม Auth ในตัว |
| DB Driver | `pgx` + `sqlc` | เร็ว type-safe กัน SQL injection |
| Auth | Supabase Auth (JWT) | ไม่ต้องเขียนระบบสมาชิกเอง |
| Deploy | Docker + VPS + Caddy | HTTPS อัตโนมัติ ค่าใช้จ่ายต่ำ |
| CI/CD | GitHub Actions + GHCR | ทดสอบ → build image → deploy อัตโนมัติ |

### ทางเลือก Frontend ที่พิจารณาแล้ว

| ตัวเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| **React + Vite (เลือก)** | ไลบรารีกระดานดี เป็น MIT คอมมูนิตี้ใหญ่ | bundle ใหญ่กว่า Svelte เล็กน้อย |
| Next.js | SSR/SEO ดี | ซับซ้อนเกินจำเป็นเพราะมี Go เป็น backend แล้ว |
| Vue 3 + Vite | เรียนง่าย | ไลบรารีกระดานน้อย และ `vue3-chessboard` ติด GPL |
| Svelte 5 | เบาและเร็วที่สุด | ไม่มีกระดานสำเร็จรูปที่ดีนัก |
| Vanilla + chessground | กระดานระดับ Lichess | license GPL-3.0 และต้องทำ UI ส่วนอื่นเองทั้งหมด |
| HTMX + Go template | เขียน Go อย่างเดียว | ไม่เหมาะกับการลากวางแบบ realtime |

---

## 2. สถาปัตยกรรม

```
[React] ──login──▶ [Supabase Auth] ──JWT──┐
   │                                      │
   └──── WSS (ส่ง JWT เป็นข้อความแรก) ────▶ [Go Server] ──▶ [Supabase Postgres]
                                          Hub → Room goroutines
```

- **Hub:** เก็บ `map[roomID]*Room` แล้วส่งข้อความต่อไปยังห้องที่ถูกต้อง
- **Room:** 1 ห้อง = 1 goroutine รับข้อความผ่าน channel ทีละข้อความ จึงไม่ต้องใช้ mutex และไม่เกิด race
- **Connection:** ใช้ 2 goroutine ต่อ connection ตัวหนึ่งอ่าน (read pump) อีกตัวเขียน (write pump)
- **State:** เกมที่กำลังเล่นเก็บใน memory แล้วบันทึกลง DB ตอนจบเกม (หรือเป็นระยะเผื่อเซิร์ฟเวอร์ล่ม)
- **ขยายภายหลัง:** ถ้าต้องใช้หลายเซิร์ฟเวอร์ ค่อยเพิ่ม Redis ไว้เก็บ state และ pub/sub

### โครงสร้างโปรเจกต์

```
/server
  /cmd/server/main.go
  /internal/hub      → Hub, Room (game loop)
  /internal/game     → wrapper ของ chess lib + นาฬิกา
  /internal/store    → DB (users, games)
/web                 → React + Vite
/.github/workflows/ci.yml
Dockerfile
docker-compose.yml
```

### รูปแบบข้อความ WebSocket (JSON)

```json
// Client → Server
{"type":"auth","token":"<jwt>"}
{"type":"join","room":"<roomId>"}
{"type":"move","ply":12,"from":"e2","to":"e4","promo":""}
{"type":"resign"}
{"type":"chat","text":"gg"}
{"type":"report","id":7}

// Server → Client
{"type":"auth_ok","userId":"..."}
{"type":"state","room":"<roomId>","status":"playing","fen":"...","turn":"b","ply":13,
 "lastMove":{"from":"e2","to":"e4"},
 "players":{"w":{"connected":true,"name":"น้ำผึ้ง","avatar":"<รหัสรูป>"},"b":{"connected":true,"guest":true}},
 "you":{"role":"player","color":"w"},
 "tc":"5+3","clock":{"w":295000,"b":300000,"running":"b"},
 "game":"chess"}
{"type":"chat","id":7,"sender":"u1","from":"w","text":"gg","at":1795650000000,"mine":false}
{"type":"report_ok","id":7}
{"type":"chat_history","messages":[ ...ข้อความแชทล่าสุดไม่เกิน 50 ข้อความ... ]}
{"type":"game_over","result":"0-1","reason":"resign"}
{"type":"error","code":"not_your_turn"}
```

- `state` คือภาพรวมทั้งห้อง ส่งทุกครั้งที่มีอะไรเปลี่ยน client ที่เพิ่งเข้าหรือ reconnect ใช้ข้อความเดียววาดหน้าจอได้ครบ
- `status` เป็น `waiting` / `playing` / `finished` เมื่อจบเกม `state` จะมี `result` และ `reason` ด้วย
- `you.role` เป็น `player` หรือ `spectator` (แต่ละคนได้ค่าของตัวเอง)
- `ply` ใน `move` ต้องเท่ากับ `ply` ล่าสุดใน `state` ไม่งั้นได้ `stale_move`
- ผู้เล่นที่หลุดระหว่างเกมจะมี `"connected":false,"graceLeft":<วินาที>` ใน `players` ถ้าไม่กลับมาทันจะแพ้ด้วย `abandon` ผู้เล่นที่ยังมีแท็บอื่นเปิดอยู่ถือว่ายังอยู่
- `players` มี `name` และ `avatar` (รหัสรูป เปิดดูที่ `/api/avatars/<รหัส>`) ถ้าผู้เล่นตั้งโปรไฟล์ไว้ และ `guest: true` ถ้าไม่ได้ login ไม่มีการส่ง user ID หรืออีเมลของคู่แข่ง ค่าเหล่านี้อ่าน ณ ตอนที่ผู้เล่นเชื่อมต่อ
- `resign` ไม่มี field อื่น ผู้แพ้คือเจ้าของ connection เสมอ
- หน้าเว็บปิด socket เองเมื่อออกจากหน้า (`pagehide`) เพราะเบราว์เซอร์อาจเก็บหน้าไว้ใน back/forward cache โดย socket ยังเปิดอยู่
- `clock` เป็นมิลลิวินาทีที่เหลือ ณ ตอนส่ง และ `running` คือฝั่งที่นาฬิกากำลังเดิน (`""` = หยุด) หน้าเว็บนับต่อเองเพื่อแสดงผลเท่านั้น
- นาฬิกาเริ่มเดินเมื่อผู้เล่นครบสองคน หักเวลาเมื่อเดินตาที่ถูกกติกา แล้วบวก increment หมดเวลาแพ้ด้วย `timeout`
- แชท: ข้อความ 1–200 ตัวอักษร ห้ามอักขระควบคุม ส่งได้ทั้งผู้เล่นและผู้ชม (`from` เป็น `""` ถ้าเป็นผู้ชม) จำกัดคนละ 5 ข้อความรัว จากนั้น 1 ข้อความต่อ 2 วินาที เกินได้ error `chat_rate_limited`
- `sender` ในแชทคือเลขประจำตัวในห้องของผู้ส่ง (ไม่ใช่ user ID) หน้าเว็บใช้ซ่อนข้อความทั้งหมดของคนเดียวกัน การซ่อนมีผลเฉพาะจอของคนที่กด
- `report` รายงานข้อความแชทด้วย `id` เซิร์ฟเวอร์หาผู้ส่งและเนื้อความเองจากประวัติของห้อง รายงานข้อความของตัวเองหรือข้อความที่ไม่มีจะไม่เกิดอะไร คนละ 3 ครั้งรัว จากนั้น 1 ครั้งต่อ 20 วินาที
- เกินโควตาข้อความของ connection ได้ error `rate_limited` และข้อความนั้นถูกทิ้ง ผู้ใช้ที่เปิด connection เกินจำนวนได้ `too_many_connections` แล้วถูกตัด
- ทุกชนิดข้อความขาเข้ารับเฉพาะ field ของชนิดนั้น field ของชนิดอื่นที่ปนมาถูกปฏิเสธ

### HTTP API

| Method | Path | หน้าที่ |
|---|---|---|
| `POST` | `/api/guest` | ออกตัวตนชั่วคราว คืน `{userId, token}` (ใช้จนกว่าจะมี Supabase Auth) |
| `POST` | `/api/rooms` | สร้างห้อง ต้องส่ง `Authorization: Bearer <token>` body `{"timeControl":"5+3","game":"makruk"}` (ไม่บังคับทั้งคู่ ค่าเริ่มต้น `10+0` และ `chess`; เวลารับ 1–60 นาที + 0–60 วินาที; เกมรับ `chess` / `makruk`) คืน `{roomId}` |
| `GET` | `/api/profile` | โปรไฟล์ของผู้เรียก คืน `{name, avatar}` ต้องเป็นบัญชีที่ login (guest ได้ 403 `account_required`) |
| `PUT` | `/api/profile` | ตั้งชื่อที่แสดง body `{"name":"..."}` ชื่อว่าง = ลบชื่อ |
| `PUT` | `/api/profile/avatar` | อัปโหลดรูป body เป็นไฟล์ JPEG หรือ PNG ไม่เกิน 256 KB และ 512×512 พิกเซล |
| `DELETE` | `/api/profile/avatar` | ลบรูป |
| `GET` | `/api/avatars/{id}` | ไฟล์รูป ไม่ต้อง login |
| `GET` | `/ws` | WebSocket |
| `GET` | `/healthz` | health check |

คำขอที่เกินโควตาได้ `429` พร้อม `{"error":"rate_limited"}` สร้างห้องขณะมีห้องที่ยังไม่จบครบจำนวนได้ `429 too_many_rooms` และเมื่อห้องเต็มทั้งเซิร์ฟเวอร์ได้ `503 server_full`

---

## 3. Database (Supabase)

| ตาราง | ฟิลด์หลัก |
|---|---|
| `users` | id (จาก Supabase Auth), display_name, rating, created_at |
| `rooms` | id, status (`waiting` / `playing` / `finished`), created_by, created_at |
| `games` | id, room_id, white_id, black_id, pgn, result (`1-0` / `0-1` / `1/2-1/2`), reason, started_at, ended_at |

ค่า `reason` ที่ใช้ได้: `checkmate`, `resign`, `timeout`, `draw`, `stalemate`, `abandon`, `count` (หมากรุกไทย: นับศักดิ์ครบ)

ตาราง `games` มีคอลัมน์ `variant` (`chess` / `makruk`) บอกชนิดของเกม ส่วนห้องที่ยังเปิดอยู่เก็บชนิดของเกมใน `rooms.snapshot`

### ที่ทำจริง (เฟส 5)
- ไฟล์ migration อยู่ที่ `server/internal/store/migrations/` ฝังในโปรแกรมและรันเองตอนเซิร์ฟเวอร์เริ่ม (บันทึกในตาราง `schema_migrations`)
- `rooms` มีคอลัมน์ `time_control` และ `snapshot` (jsonb: ที่นั่ง ตาเดิน เวลาบนนาฬิกา) บันทึกทุกครั้งที่ที่นั่งหรือตาเดินเปลี่ยน
- ตอนเริ่ม เซิร์ฟเวอร์โหลดห้องที่ยังไม่จบกลับมา ตาเดินถูกเล่นซ้ำและตรวจกติกาใหม่ เวลาที่เซิร์ฟเวอร์ดับไม่ถูกหักจากนาฬิกา ผู้เล่นมีเวลา `ABANDON_GRACE` ในการกลับเข้ามา
- `games.white_id` / `black_id` อ้างถึง `auth.users` และเป็น `NULL` เมื่อผู้เล่นเป็น guest
- การเขียนทั้งหมดทำเบื้องหลัง ฐานข้อมูลช้าหรือล่มไม่ทำให้เกมค้าง งานที่เขียนไม่สำเร็จถูกลองใหม่
- ทุกตารางเปิด RLS โดยไม่มี policy และถอนสิทธิ์ของ role `anon` / `authenticated`
- ต้องตั้ง `GUEST_SECRET` ให้คงที่ ไม่งั้นหลังรีสตาร์ต guest จะกลับที่นั่งเดิมไม่ได้
- แชทไม่ถูกบันทึก หายเมื่อรีสตาร์ต
- ตรวจการเชื่อมต่อและดูข้อมูล: `go run ./cmd/dbcheck` และ `go run ./cmd/dbcheck -summary` (ในโฟลเดอร์ `server`)

### โปรไฟล์ (ชื่อและรูป)
- ตาราง `profiles`: `user_id` (uuid ของบัญชี Supabase), `display_name`, `avatar_id`, `avatar` (bytea), `avatar_type` ใช้แทนตาราง `users` ในตารางด้านบน ยังไม่มี rating
- เฉพาะผู้ใช้ที่ login ตั้งได้ เจ้าของโปรไฟล์มาจาก token เท่านั้น
- ชื่อ: 3–20 ตัวอักษร รับเฉพาะตัวอักษร ตัวเลข ช่องว่าง และ `_ - .` ไม่บังคับให้ไม่ซ้ำกัน
- รูป: หน้าเว็บตัดเป็นสี่เหลี่ยมจัตุรัสตรงกลางและย่อเป็น JPEG 256 พิกเซลก่อนส่ง เซิร์ฟเวอร์ตรวจชนิดจากเนื้อไฟล์ ตรวจขนาดจาก header แล้วถอดรหัสและเข้ารหัสใหม่ จึงไม่มี EXIF หรือข้อมูลแฝงเหลือ
- รูปเก็บในฐานข้อมูล (ไม่ใช้ Supabase Storage) เสิร์ฟผ่าน Go พร้อม `nosniff` และ CSP แบบ sandbox รหัสรูปเป็นเลขสุ่มที่เปลี่ยนทุกครั้งที่อัปโหลด จึง cache ได้ถาวรและไม่เปิดเผย user ID
- `profiles.user_id` ไม่ผูก foreign key กับ `auth.users` ถ้าลบบัญชีใน Supabase แถวโปรไฟล์จะค้างอยู่
- ถ้าไม่ตั้ง `DATABASE_URL` โปรไฟล์เก็บใน memory และหายเมื่อรีสตาร์ต

### ข้อควรระวัง
- **Connection:** Go server ทำงานต่อเนื่อง ให้ใช้ **Session pooler (port 5432)** ถ้าใช้ Transaction pooler (6543) ต้องปิด prepared statements โดยตั้ง `default_query_exec_mode=simple_protocol` ใน pgx
- **Free plan:** จะถูก pause ถ้าใช้งานน้อยใน 7 วัน ถ้าเปิดให้คนเล่นจริงควรใช้ Pro
- **ไม่ใช้ Supabase Realtime ส่งตาเดิน:** ให้ Go เป็นผู้ตัดสินเพียงตัวเดียว

---

## 4. ฟีเจอร์

- สร้างและเข้าห้องด้วยรหัสหรือลิงก์ ห้องละ 2 คน สุ่มสีขาว/ดำ
- คนดู (spectator) เข้าห้องได้ แต่เดินหมากไม่ได้
- เดินหมาก ตรวจกติกาครบ (castling, en passant, promotion, รุกจน, เสมอ)
- เลือกเกมได้ตอนสร้างห้อง: หมากรุกสากล หรือหมากรุกไทย (มีการนับศักดิ์)
- นาฬิกาจับเวลา โดยให้เซิร์ฟเวอร์นับ
- แชทในห้อง
- หลุดแล้วกลับเข้าเกมเดิมได้ ถ้าไม่กลับมาภายใน 60 วินาทีนับว่าแพ้ (`abandon`)
- **ปุ่มยอมแพ้**
- ชื่อที่แสดงและรูปโปรไฟล์สำหรับผู้ใช้ที่ login (ผู้เล่นที่ไม่ได้ login แสดงเป็น "ผู้เล่นรับเชิญ")
- ชุดหมากรุก 12 ชุด (สีกระดานและสีตัวหมาก) ผู้เล่นเก็บชุดที่ชอบได้ 5 ช่องและสลับได้ระหว่างเกม เก็บในเบราว์เซอร์ของแต่ละคน
- เอฟเฟกต์บนกระดานเมื่อกินหมาก รุก และรุกฆาต เลือกได้ในหน้าโปรไฟล์
- ป็อปอัปผลเกม และการ์ดรอคู่แข่งที่แสดงรหัสห้องตัวใหญ่พร้อมปุ่มคัดลอกและแชร์
- (ภายหลัง) ปุ่มขอเสมอ ประวัติเกม และ rating

### หน้าตา (ระบบดีไซน์ "สติกเกอร์")
ที่มา: ไฟล์ต้นแบบ `CheckMate Live.dc.html` และเอกสาร Design Improve ของเจ้าของโปรเจกต์ ค่าทั้งหมดอยู่ใน `web/src/index.css`

- **สี:** Ink `#3B2F4A` (ตัวอักษร เส้นขอบ เงา), Cream `#FFF7EC` (พื้นหลัง), Pink `#FF8FB1` (ปุ่มหลัก), Pink strong `#FF5C8D` (โฟกัส ทางเดินหมาก), Mint `#9FE3C9`, Lavender `#C9BDFF`, Butter `#FFDC85` (ตาเดินปัจจุบัน ตัวเลือกที่เลือกอยู่), Sky `#A9D6F7`, Error `#C2185B`
- **ตัวอักษร:** Mitr (หัวข้อ ปุ่ม นาฬิกา) และ Mali (เนื้อหา) เสิร์ฟจากเซิร์ฟเวอร์ของเราเองผ่านแพ็กเกจ `@fontsource` ไม่เรียก Google Fonts
- **รูปทรง:** เส้นขอบ 2.5–3px สี Ink มุมโค้ง 14–24px เงาแข็ง `0 4–6px 0 Ink` ที่ยุบลงเมื่อกด ตัวเลือกที่เลือกอยู่มีวงแหวนสีชมพู
- **การเคลื่อนไหว:** easing เด้ง `cubic-bezier(.34,1.56,.64,1)` ส่วนของหน้าลอยขึ้นทีละส่วน หมากเด้งลงช่อง และปิดทั้งหมดเมื่อผู้ใช้ตั้ง `prefers-reduced-motion`
- **กฎที่ต้องรักษา:** ปุ่มหลักสีชมพูไม่เกิน 1 ปุ่มต่อหน้าจอ ตัวอักษรไม่ต่ำกว่า 12px ปุ่มสูงไม่ต่ำกว่า 44px บนมือถือ ป้ายที่มุมหมากต้องอ่านออกทุกชุดสี

หน้าทั้งหมด: `/` หน้าแรก, `/play` เลือกเกมและตั้งเวลา, `/room/<รหัส>` กระดาน, `/profile` โปรไฟล์ ชุดหมากรุก เอฟเฟกต์, `/login`, `/register`, `/terms`, `/rules`

ส่วนที่อยู่ในต้นแบบแต่ยังไม่ได้ทำ:
- หมากฮอส หมากหนีบ: แสดงในหน้าเลือกเกมเป็น "เร็วๆ นี้" เพราะเซิร์ฟเวอร์ยังไม่มีกติกาของสองเกมนี้ (ทำทีละเกม ดูหัวข้อ "หลายเกม")
- รหัสห้อง 6 หลัก: ยังใช้รหัส 12 ตัวเดิม เพราะรหัส 6 หลักมีเพียงหนึ่งล้านแบบ คนนอกเดาเข้าห้องได้
- ป้ายอธิบายหมากเมื่อชี้ ลืมรหัสผ่าน ขอเสมอ ขอย้อนตา หมากที่ถูกกิน ประวัติตาเดิน เสียง และธีมกลางคืน
- ตัวหมากยังวาดจากสัญลักษณ์ในฟอนต์ของเครื่อง หน้าตาจึงต่างกันเล็กน้อยตามอุปกรณ์

### หลายเกม
ห้องหนึ่งเล่นเกมหนึ่งชนิด เลือกตอนสร้างห้อง ตอนนี้มีหมากรุกสากล (`chess`) และหมากรุกไทย (`makruk`)

- **ฝั่งเซิร์ฟเวอร์:** กติกาแต่ละเกมอยู่หลัง interface `game.Engine` (`server/internal/game/engine.go`) ห้อง นาฬิกา แชท การหลุด และการบันทึก ใช้ร่วมกันทุกเกม เพิ่มเกมใหม่ = เขียน Engine ใหม่ แล้วเพิ่มชื่อใน `game.ParseVariant`
- **ฝั่งหน้าเว็บ:** หมากรุกสากลคำนวณตาเดินเองด้วย chess.js ส่วนเกมอื่นหน้าเว็บไม่มีกติกา เซิร์ฟเวอร์ส่ง `legal` (ช่องต้นทาง → ช่องปลายทางของฝ่ายที่ถึงตา) `check` (ช่องของขุนที่ถูกรุก) และ `count` มากับ `state` ให้ใช้ไฮไลต์ ตาเดินจริงยังถูกตรวจที่เซิร์ฟเวอร์เสมอ
- **เพิ่มเกมฝั่งหน้าเว็บ:** `web/src/lib/games.ts` (รายการเกม), `web/src/lib/rules.ts` (หน้ากฎ), ตัวช่วยใน `web/src/lib/moves.ts`

#### หมากรุกไทย
- ตำแหน่งเริ่ม `rnsmksnr/8/pppppppp/8/8/PPPPPPPP/8/RNSKMSNR w` ตัวอักษร: K ขุน, M เม็ด, S โคน, N ม้า, R เรือ, P เบี้ย, F เบี้ยหงาย
- เบี้ยเดินทีละช่อง หงายเองเมื่อถึงแถวที่ 6 ของตัวเอง ไม่มีการเข้าป้อม ไม่มีการกินผ่าน
- เสมอเมื่ออับ ตำแหน่งซ้ำ 3 ครั้ง เหลือแต่ขุนสองตัว หรือนับศักดิ์ครบ
- **การนับศักดิ์ทำให้อัตโนมัติ** (บนกระดานจริงผู้เล่นต้องขอนับเอง) ซึ่งเป็นการตัดสินใจเพื่อให้เล่นออนไลน์ได้โดยไม่ต้องมีปุ่มขอนับ:
  - ยังมีเบี้ยคว่ำบนกระดาน: ไม่นับ
  - ไม่มีเบี้ยคว่ำ ทั้งสองฝ่ายยังมีหมากอื่น: นับศักดิ์กระดาน ครบ 64 ตาของทั้งสองฝ่ายแล้วยังไม่จน เสมอ
  - ไม่มีเบี้ยคว่ำ ฝ่ายหนึ่งเหลือขุนตัวเดียว: นับศักดิ์หมาก ฝ่ายหนีนับตาเดินของตัวเอง เริ่มจากจำนวนหมากทั้งกระดาน + 1 ถึงจำนวนตามหมากของฝ่ายไล่ ณ ตอนเริ่มนับ (เรือ 2 ลำ 8, เรือ 1 ลำ 16, โคน 2 ตัว 22, ม้า 2 ตัว 32, โคน 1 ตัว 44, นอกนั้น 64) เมื่อนับครบแล้วฝ่ายไล่เดินได้อีก 1 ตา ถ้ายังไม่จน เสมอ
- ตัวสร้างตาเดินถูกตรวจกับจำนวนตำแหน่งมาตรฐานของหมากรุกไทย (perft: 23, 529, 12012, 273026) ใน `makruk_test.go`
- ตัวหมากใช้สัญลักษณ์หมากรุกสากลจากฟอนต์ของเครื่อง (เม็ดใช้รูปควีน โคนใช้รูปบิชอป เบี้ยหงายคือเบี้ยกลับหัว) ยังไม่ได้วาดตัวหมากทรงไทย

### ปุ่มยอมแพ้

ลำดับการทำงาน:
1. ผู้เล่นกด "ยอมแพ้" แล้วขึ้นกล่องยืนยัน
2. Client ส่ง `{"type":"resign"}`
3. เซิร์ฟเวอร์ตรวจว่าผู้ส่งเป็นผู้เล่นในห้องนี้และเกมยังไม่จบ
4. ตั้งผลให้อีกฝ่ายชนะ หยุดนาฬิกา แล้ว broadcast `game_over` ไปทั้งห้อง
5. บันทึกลง DB โดยใช้ `reason = "resign"`

```go
case "resign":
    color, ok := r.colorOf(msg.UserID) // ต้องเป็นผู้เล่น ไม่ใช่ spectator
    if !ok || r.status != StatusPlaying {
        return
    }
    r.game.Resign(color)
    r.status = StatusFinished
    r.clock.Stop()
    r.broadcast(GameOver{Type: "game_over", Result: r.game.Outcome().String(), Reason: "resign"})
    go r.store.SaveGame(r.snapshot())
```

```jsx
<button
  disabled={status !== "playing" || isSpectator}
  onClick={() => {
    if (confirm("ยืนยันยอมแพ้?")) ws.send(JSON.stringify({ type: "resign" }));
  }}
>
  ยอมแพ้
</button>
```

กฎ: ห้ามรับ field `winner` หรือ `color` จาก client และถ้ากดซ้ำหรือส่งมาหลังเกมจบให้ไม่ต้องทำอะไร

---

## 5. Security

> หลักสำคัญ: **อย่าเชื่ออะไรที่มาจาก client** ให้เซิร์ฟเวอร์เป็นผู้ตัดสินทุกอย่าง

### Auth
- ตรวจ JWT ของ Supabase (ลายเซ็นผ่าน JWKS, `exp`, `aud`) ทุกครั้งที่เปิด WebSocket
- ไม่ส่ง token ใน URL ให้ส่งเป็นข้อความแรก ถ้าไม่ผ่านใน 5 วินาทีให้ตัดการเชื่อมต่อ
- ผูกผู้เล่นกับ `user_id` ไม่ใช่ connection

**ที่ทำจริง (เฟส 4):**
- โปรเจกต์ Supabase ต้องใช้ signing key แบบ asymmetric (ES256/RS256) เซิร์ฟเวอร์รับเฉพาะสองอัลกอริทึมนี้ และตรวจ `iss` เพิ่มด้วย
- ผู้เล่นมีสองแบบ: ผู้ใช้ที่ login (user ID = `sub` ใน JWT) และ guest (token ที่ Go server ออกเอง ขึ้นต้นด้วย `guest_`) เล่นด้วยกันได้
- ถ้าไม่ตั้ง `SUPABASE_JWKS_URL` (server) หรือ `VITE_SUPABASE_URL` (web) ระบบทำงานแบบ guest อย่างเดียว
- หน้าเว็บ login ด้วยอีเมลและรหัสผ่านผ่าน `supabase-js` รหัสผ่านไม่ผ่าน Go server

### ตรรกะเกม
- ตรวจทุกตาเดินว่าผู้ส่งอยู่ในห้องนี้ เป็นสีที่ถึงตาเดิน และตาเดินถูกกติกา
- นาฬิกานับที่เซิร์ฟเวอร์เท่านั้น
- ใช้เลข `ply` กันการส่งซ้ำหรือส่งตาเดินเก่าเข้ามาใหม่
- ใช้ `crypto/rand` สุ่ม room ID ให้เดาไม่ได้

### WebSocket และการกันสแปม
- ตรวจ Origin (`OriginPatterns`)
- จำกัดขนาดข้อความ `SetReadLimit(4096)`
- ใส่ rate limit ต่อ connection เช่น 10 ข้อความต่อวินาที (`golang.org/x/time/rate`)
- จำกัดจำนวน connection ต่อ IP หรือต่อ user และจำนวนห้องที่สร้างได้ต่อคน
- ใช้ ping/pong ตัด connection ที่ค้าง และลบห้องที่ว่างนาน
- decode JSON แบบเข้มงวด (`DisallowUnknownFields`) และตรวจรูปแบบช่องหมาก `^[a-h][1-8]$`

**ที่ทำจริง (เฟส 7):** โควตาทั้งหมดอยู่ใน memory ของเซิร์ฟเวอร์ (ระบบมี instance เดียว) ค่าอยู่ที่ `hub.Config` และ `httpapi.DefaultLimits`

| เรื่อง | โควตา | นับต่อ |
|---|---|---|
| WebSocket ที่เปิดพร้อมกัน | 40 | IP (นับตั้งแต่ก่อน auth) |
| WebSocket ที่เปิดพร้อมกัน | 8 | ผู้ใช้ |
| ข้อความใน WebSocket | รัว 20 จากนั้น 10 ต่อวินาที ส่งเกินซ้ำ 30 ครั้งถูกตัด | connection |
| ห้องที่ยังไม่จบ | 5 | ผู้สร้าง |
| ห้องทั้งหมด | 1000 | เซิร์ฟเวอร์ |
| สร้างห้อง | รัว 5 จากนั้น 1 ต่อ 10 วินาที | ผู้ใช้ |
| ขอตัวตน guest | รัว 10 จากนั้น 1 ต่อ 6 วินาที | IP |
| คำขอเขียนใต้ `/api` (นับก่อนตรวจ token) | รัว 30 จากนั้น 1 ต่อวินาที | IP |
| คำขออ่านใต้ `/api` | รัว 120 จากนั้น 4 ต่อวินาที | IP |
| แก้ชื่อหรือลบรูป | รัว 5 จากนั้น 1 ต่อ 10 วินาที | ผู้ใช้ |
| อัปโหลดรูป | รัว 3 จากนั้น 1 ต่อนาที | ผู้ใช้ |

- IP ของผู้ใช้มาจากที่อยู่ของ connection เว้นแต่ตั้ง `CLIENT_IP_HEADER` (บน Fly.io ต้องตั้งเป็น `Fly-Client-IP` ไม่งั้นทุกคนถูกนับเป็น IP เดียวกันของ proxy) ห้ามตั้งถ้าเซิร์ฟเวอร์รับคำขอตรงจากอินเทอร์เน็ต เพราะผู้ใช้ปลอม header ได้
- IPv6 นับรวมเป็นช่วง /64
- โควตาต่อ IP เผื่อไว้สำหรับหลายคนที่ใช้อินเทอร์เน็ตเดียวกัน ถ้ามีกลุ่มใหญ่กว่า 40 คนหลัง IP เดียวต้องเพิ่ม `MaxConnsPerIP`

### แชท
- ห้ามใช้ `dangerouslySetInnerHTML`
- จำกัดความยาวและความถี่ของข้อความ และมีระบบ report หรือ mute

**ที่ทำจริง (เฟส 7):**
- ปุ่ม "ซ่อน" ซ่อนทุกข้อความของผู้ส่งคนนั้นบนจอของคนที่กด จนกว่าจะออกจากห้องหรือกด "แสดงทั้งหมด"
- ปุ่ม "รายงาน" บันทึกลงตาราง `chat_reports` (ห้อง ข้อความ ผู้ส่ง ผู้รายงาน เวลา) และลง log ของเซิร์ฟเวอร์โดยไม่มีเนื้อความ ดูรายการล่าสุดด้วย `go run ./cmd/dbcheck -reports`
- ยังไม่มีการลงโทษอัตโนมัติและยังไม่มีระบบ ban ผู้ดูแลต้องอ่านรายงานเอง

### Database
- รหัสผ่าน DB และ service role key อยู่ใน env ของ Go เท่านั้น
- เปิด RLS ทุกตาราง ฝั่ง client ใช้ได้แค่ anon key
- ใช้ parameterized query ผ่าน `sqlc` หรือ `pgx`

### Server และ Infra
- ใช้ HTTPS/WSS เท่านั้น ผ่าน Caddy
- ตั้ง CORS เฉพาะโดเมนของเรา และใส่ security headers (CSP, HSTS)
- ตั้ง timeout ให้ `http.Server` (`ReadHeaderTimeout`, `IdleTimeout`)

**ที่ทำจริง (เฟส 7):** ทุก response มี `Content-Security-Policy` (`default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `connect-src` เฉพาะเซิร์ฟเวอร์เองกับ origin ของ Supabase), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy` และ `Permissions-Policy` ส่วน `style-src` ต้องยอม `'unsafe-inline'` เพราะกระดานหมากรุกกำหนด style ในตัว element
- รัน `govulncheck` และ `npm audit` ใน CI
- ห้ามเก็บ token หรือรหัสผ่านลง log

### Anti-cheat
- ช่วงแรกใช้ระบบ report และ ban ถ้าระบบโตค่อยเพิ่มการตรวจสถิติเทียบกับ engine

---

## 6. CI/CD (GitHub Actions)

| เหตุการณ์ | ขั้นตอน |
|---|---|
| Pull Request | Go: gofmt, vet, test `-race`, govulncheck, build · React: lint, test, build, npm audit |
| Push เข้า `main` | ทดสอบ → build Docker image ขึ้น GHCR (`latest` และ `sha-xxxxxxx`) → SSH deploy ขึ้น VPS |

- **Image:** multi-stage build (Node → Go → distroless) รันแบบ non-root
- **บน VPS:** container เป็นแบบ read-only, `cap_drop: ALL`, `no-new-privileges` และเปิด port เฉพาะ localhost

### การตั้งค่า
- **Secrets:** `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- **Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Environment:** `production` (เปิด required reviewers ได้)
- **บน VPS:** วาง `docker-compose.yml` กับ `.env` ไว้ที่ `/opt/chess`

`.env` บน VPS:
```
DATABASE_URL=postgresql://postgres.[ref]:[password]@[pooler-host]:5432/postgres
SUPABASE_JWKS_URL=https://[ref].supabase.co/auth/v1/.well-known/jwks.json
ALLOWED_ORIGINS=https://chess.example.com
STATIC_DIR=/app/web
GUEST_SECRET=<สุ่มยาว ๆ>   # ถ้าไม่ตั้ง token ของ guest จะใช้ไม่ได้หลังรีสตาร์ต
GUEST_ENABLED=true         # ไม่บังคับ ตั้ง false เพื่อบังคับ login ก่อนเล่น
ABANDON_GRACE=60s          # ไม่บังคับ ค่าเริ่มต้น 60s
CLIENT_IP_HEADER=Fly-Client-IP  # ตั้งเมื่ออยู่หลัง proxy ที่ใส่ IP จริงของผู้ใช้มาใน header นี้ (ดูหัวข้อ Security)
```

**การย้อนเวอร์ชัน:** แก้ image tag ใน compose เป็น `sha-xxxxxxx` ที่ต้องการ แล้วรัน `docker compose up -d`

---

## 7. ลำดับการพัฒนา (แนะนำ)

1. Go server: Hub/Room + WebSocket + ตรวจตาเดิน (ยังไม่ต้องมี auth)
2. หน้า React: สร้างหรือเข้าห้อง + กระดาน + ส่งตาเดิน
3. ปุ่มยอมแพ้ + จบเกม + reconnect
4. Supabase Auth + ตรวจ JWT ใน Go
5. บันทึกเกมลง DB + RLS
6. นาฬิกา + แชท + คนดู
7. Security hardening (rate limit, origin, limits)
8. CI/CD + deploy ขึ้น VPS
