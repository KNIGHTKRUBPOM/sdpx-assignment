# PairEval

ระบบประเมินงานกลุ่มและการมีส่วนร่วมแบบ pairwise สำหรับโครงการ CE-SDPX — รุ่นทดลองห้องเล็ก 30 คน

**Stack:** Next.js App Router · TypeScript · Google OAuth (Auth.js) · PostgreSQL/Drizzle · Vitest · Playwright · Docker

## เริ่มต้น

### Demo สำหรับสาธิต ไม่ต้องใช้ Google

ใช้ Node.js 22 และเปิด Docker Desktop ให้ Engine running ก่อน จาก PowerShell:

```powershell
cd D:\spdx-torpai-assignment
npm ci
npx playwright install chromium
npm run demo
```

รอจนแสดง `Ready` แล้วเปิด **http://localhost:3101/login** เลือกอาจารย์สาธิตหรือนักศึกษาสาธิต เก็บ PowerShell หน้ารันและ Docker ไว้ตลอดการสาธิต หากติดตั้ง dependencies/browser แล้ว ไม่ต้องติดตั้งซ้ำทุกครั้ง

- `npm run demo` เริ่มรอบใหม่ พร้อมห้อง 3 กลุ่ม × 4 คนและงานประเมินที่เปิดแล้ว; **Ctrl+C จะลบฐานข้อมูลชั่วคราวของรอบนั้น**
- ถ้าเว็บหยุดแต่ฐานข้อมูล Docker รอบเดิมยังอยู่ ใช้ `npm run demo:resume` เพื่อสร้างเว็บเวอร์ชันปัจจุบันและเปิดข้อมูลเดิม เลือกบัญชีใหม่หลังเปิดสำเร็จ
- ถ้า localhost เปิดอยู่แล้ว ใช้เว็บรอบเดิมได้เลย ตัวรันจะไม่สร้างฐานข้อมูลหรือ build ทับขณะพอร์ตยังถูกใช้งาน
- ดู [ขั้นตอนสร้างงานประเมินและสาธิตจนได้รายงาน](docs/demo.md) สำหรับห้องใหม่และชุดนักศึกษา 9 คน

### พัฒนาระบบที่ใช้ Google จริง

ตั้งค่า environment ด้านล่างให้ครบก่อน แล้วรัน:

```sh
npm ci
npm test
npm run dev
```

เปิด http://localhost:3000 สำหรับระบบ Google จริง ตั้งค่าผ่าน environment หรือไฟล์ `.env.local` ที่ไม่ commit:

- `DATABASE_URL`: PostgreSQL runtime connection (Supabase transaction pooler; prepare disabled)
- `MIGRATION_DATABASE_URL`: admin/session connection สำหรับ migrations เท่านั้น
- `NEXTAUTH_URL`: URL ของสภาพแวดล้อม เช่น `http://localhost:3000`
- `NEXTAUTH_SECRET`: secret แบบสุ่มอย่างน้อย 32 bytes
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth Web application credentials
- `INITIAL_OWNER_EMAILS`: อีเมลที่มีสิทธิ์สร้างห้อง เริ่มต้นตามที่ผู้ใช้ยืนยันคือ `67015105@kmitl.ac.th`

Google callback: `{NEXTAUTH_URL}/api/auth/callback/google` ตั้ง allowed domain ของห้องแรกเป็น `kmitl.ac.th` และนำเข้าอีเมลเดียวกับ Google account ของผู้ใช้ สมาชิกใหม่ไม่ได้สิทธิ์อาจารย์โดยอัตโนมัติ

CLI scripts อ่าน environment ของ shell; ถ้าเก็บใน `.env.local` ให้ใช้ `node --env-file=.env.local --import tsx scripts/migrate.ts` สำหรับ migrations อย่าใส่ migration credentials ใน Vercel runtime

## การทดสอบ

ลองใช้งานโดยไม่ใช้ Google: `npm run demo` แล้วเปิด http://localhost:3101/login เลือกบัญชีอาจารย์หรือนักศึกษา 12 คนได้ ใช้ข้อมูลสมมติและฐานข้อมูล Docker ชั่วคราวแยกจาก production เท่านั้น ดู [คู่มือ Demo](docs/demo.md) และรัน `npm run test:demo` เพื่อตรวจ flow ทั้งห้อง

```sh
npm run lint
npm run typecheck
npm run lint:spec
npm run test:coverage
npx tsx scripts/test-database.ts integration
npx tsx scripts/test-database.ts ops
npm run build
npx playwright install chromium
npx tsx scripts/test-database.ts e2e --repeat-each=3
npx tsx scripts/test-database.ts perf
```

Test harness สร้าง PostgreSQL ชั่วคราวพร้อมรหัสผ่านสุ่มใน memory, migrate และหยุด container อัตโนมัติ ไม่ใช้ฐานข้อมูลจริง ไม่มี test login/seed endpoint ในเว็บที่ deploy

## Docker / Deploy

```sh
docker build -t paireval .
# ตั้ง POSTGRES_PASSWORD, NEXTAUTH_SECRET และ Google env ก่อน
docker compose up --build
```

Compose สร้างฐานข้อมูลถาวรและรัน migrations ก่อนเริ่มแอป ผูก port เฉพาะ localhost; server จริงต้องมี HTTPS reverse proxy ดู [คู่มือ deploy](docs/deployment.md)

Cloud เป้าหมาย: Vercel Hobby + Supabase Free (แยก staging/pilot) โดยยังต้องตั้ง secrets/Google OAuth ในบัญชีเจ้าของระบบ ไม่มีการรับรองว่า free tier จะไม่พักหรือไม่มี quota

## เอกสารส่งงาน

- [Backlog และ AC](docs/backlog.md), [architecture](docs/architecture.md), [ERD](docs/erd.md), [OpenAPI](docs/openapi.yaml)
- [Test plan](TEST_PLAN.md), [WS1–8 evidence checklist](docs/ws-evidence.md), [security review](docs/security-pre-check.md)
- [Deployment and restore](docs/deployment.md), [ตั้งค่าและสาธิต CD](docs/cd-demo.md), [decisions](docs/adr/ADR-004-pilot-deployment.md)
- [Measured performance and verification](docs/verification.md)
- [Current cloud setup status](docs/cloud-status.md)

## ขอบเขตและข้อจำกัด

รองรับ classroom/CSV, criteria, pairing, autosave/re-submit, participation, reports/CSV, immutable finalize, personal overrides และ audit ใช้ Google เท่านั้น ไม่มี local password

ยังไม่รวม email, XLSX, appeals, scheduled recompute, automatic anonymization, reopen/regeneration หลังส่งแล้ว และการรับรอง 200 users/SLA/RPO ตาม PRD ฉบับเต็ม ต้องตรวจ Google consent จริงและการอนุมัติ cloud ของรายวิชาก่อนใช้ข้อมูลนักศึกษาจริง

`src/server` และ `src/storage/memory-store.ts` เป็น legacy test harness; production entrypoint อยู่ที่ `src/app` และไม่ใช้ mock authentication
