// Package envfile อ่านไฟล์ .env แบบง่าย (KEY=VALUE ต่อบรรทัด) สำหรับใช้ตอนพัฒนาในเครื่อง
// บนเซิร์ฟเวอร์จริงค่าเหล่านี้มาจาก environment ของ platform ไม่ใช่จากไฟล์
package envfile

import (
	"bufio"
	"errors"
	"io/fs"
	"os"
	"strings"
)

// Load ตั้ง environment variable จากไฟล์ โดยไม่ทับค่าที่ตั้งไว้แล้ว
// ถ้าไม่มีไฟล์ถือว่าไม่ผิดพลาด
func Load(path string) error {
	f, err := os.Open(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\xef\xbb\xbf"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		if _, set := os.LookupEnv(key); !set && key != "" {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	return sc.Err()
}
