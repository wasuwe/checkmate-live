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

// Server → Client
{"type":"auth_ok","userId":"..."}
{"type":"state","room":"<roomId>","status":"playing","fen":"...","turn":"b","ply":13,
 "lastMove":{"from":"e2","to":"e4"},
 "players":{"w":{"connected":true},"b":{"connected":true}},
 "you":{"role":"player","color":"w"},
 "clock":{"w":295,"b":300}}
{"type":"game_over","result":"0-1","reason":"resign"}
{"type":"error","code":"not_your_turn"}
```

- `state` คือภาพรวมทั้งห้อง ส่งทุกครั้งที่มีอะไรเปลี่ยน client ที่เพิ่งเข้าหรือ reconnect ใช้ข้อความเดียววาดหน้าจอได้ครบ
- `status` เป็น `waiting` / `playing` / `finished` เมื่อจบเกม `state` จะมี `result` และ `reason` ด้วย
- `you.role` เป็น `player` หรือ `spectator` (แต่ละคนได้ค่าของตัวเอง)
- `ply` ใน `move` ต้องเท่ากับ `ply` ล่าสุดใน `state` ไม่งั้นได้ `stale_move`
- `clock` จะมาในเฟส 6

### HTTP API

| Method | Path | หน้าที่ |
|---|---|---|
| `POST` | `/api/guest` | ออกตัวตนชั่วคราว คืน `{userId, token}` (ใช้จนกว่าจะมี Supabase Auth) |
| `POST` | `/api/rooms` | สร้างห้อง ต้องส่ง `Authorization: Bearer <token>` คืน `{roomId}` |
| `GET` | `/ws` | WebSocket |
| `GET` | `/healthz` | health check |

---

## 3. Database (Supabase)

| ตาราง | ฟิลด์หลัก |
|---|---|
| `users` | id (จาก Supabase Auth), display_name, rating, created_at |
| `rooms` | id, status (`waiting` / `playing` / `finished`), created_by, created_at |
| `games` | id, room_id, white_id, black_id, pgn, result (`1-0` / `0-1` / `1/2-1/2`), reason, started_at, ended_at |

ค่า `reason` ที่ใช้ได้: `checkmate`, `resign`, `timeout`, `draw`, `stalemate`, `abandon`

### ข้อควรระวัง
- **Connection:** Go server ทำงานต่อเนื่อง ให้ใช้ **Session pooler (port 5432)** ถ้าใช้ Transaction pooler (6543) ต้องปิด prepared statements โดยตั้ง `default_query_exec_mode=simple_protocol` ใน pgx
- **Free plan:** จะถูก pause ถ้าใช้งานน้อยใน 7 วัน ถ้าเปิดให้คนเล่นจริงควรใช้ Pro
- **ไม่ใช้ Supabase Realtime ส่งตาเดิน:** ให้ Go เป็นผู้ตัดสินเพียงตัวเดียว

---

## 4. ฟีเจอร์

- สร้างและเข้าห้องด้วยรหัสหรือลิงก์ ห้องละ 2 คน สุ่มสีขาว/ดำ
- คนดู (spectator) เข้าห้องได้ แต่เดินหมากไม่ได้
- เดินหมาก ตรวจกติกาครบ (castling, en passant, promotion, รุกจน, เสมอ)
- นาฬิกาจับเวลา โดยให้เซิร์ฟเวอร์นับ
- แชทในห้อง
- หลุดแล้วกลับเข้าเกมเดิมได้ ถ้าไม่กลับมาภายใน 60 วินาทีนับว่าแพ้ (`abandon`)
- **ปุ่มยอมแพ้**
- (ภายหลัง) ปุ่มขอเสมอ ประวัติเกม และ rating

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

### แชท
- ห้ามใช้ `dangerouslySetInnerHTML`
- จำกัดความยาวและความถี่ของข้อความ และมีระบบ report หรือ mute

### Database
- รหัสผ่าน DB และ service role key อยู่ใน env ของ Go เท่านั้น
- เปิด RLS ทุกตาราง ฝั่ง client ใช้ได้แค่ anon key
- ใช้ parameterized query ผ่าน `sqlc` หรือ `pgx`

### Server และ Infra
- ใช้ HTTPS/WSS เท่านั้น ผ่าน Caddy
- ตั้ง CORS เฉพาะโดเมนของเรา และใส่ security headers (CSP, HSTS)
- ตั้ง timeout ให้ `http.Server` (`ReadHeaderTimeout`, `IdleTimeout`)
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
