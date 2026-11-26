# ARG ที่ใช้ในบรรทัด FROM ต้องประกาศก่อน FROM ตัวแรก
ARG GO_VERSION=1.27

# ---------- 1) Build หน้าเว็บ React ----------
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---------- 2) Build Go server ----------
FROM golang:${GO_VERSION}-alpine AS server
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---------- 3) Image สำหรับรันจริง (เล็กและไม่มี shell) ----------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=server /out/server /app/server
COPY --from=web /web/dist /app/web
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/server"]
