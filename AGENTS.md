# AGENTS.md

## Project
PairEval — ระบบประเมินผลนักศึกษาแบบ Pairwise Comparison สำหรับงานกลุ่มและรายบุคคล เพื่อลดอคติการให้คะแนนเดี่ยวและแก้ปัญหา Free-rider (รายละเอียดดู `memory-bank/intent.md`)

## Setup & Commands
- install: `npm ci` (Node.js 22)
- dev:     `npm run dev`
- test:    `npm test`
- lint:    `npm run lint` and `npm run lint:spec`
- types:   `npm run typecheck`
- database integration: `npx tsx scripts/test-database.ts integration` (Docker)
- browser: `npm run build` then `npx tsx scripts/test-database.ts e2e --repeat-each=3`
- runtime/restore: `npx tsx scripts/test-database.ts ops`
- build:   `npm run build`

## Conventions
- ภาษา: TypeScript 5.x (Strict mode) / Node.js ES Modules
- Scoring Engine & Pairing Engine ต้องเป็น Pure Functions (ไม่มี side-effects หรือ state ภายใน) ตาม AR-01
- ใช้ `data-testid` กับ UI element ทุกตัวที่ automated test จะอ้างถึง
- Commit ตาม Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`)
- Branch: ทำงานบน `feature/*` แล้ว PR เข้า `develop`

## Rules for agents
- ต้องรัน test ให้เขียวก่อนเสนอ diff เสมอ (`npm test`)
- ถ้า test แดง ให้แก้ code — **ห้ามแก้หรือลบ test เพื่อให้ผ่าน**
- ห้ามใส่ค่า secret หรือ credentials ลงไฟล์ใด ๆ ให้ใช้ env var เท่านั้น
- ห้ามแก้ `docs/adr/` และ `memory-bank/` โดยไม่ถามและตกลงกับผู้ใช้ก่อน
- ปฏิบัติตาม Data Integrity & Anonymity Rules ใน PRD เคร่งครัด (FR-ANON-01, FR-AUTHZ-01/02, FR-AUDIT-01)
- แก้ทีละเรื่อง — diff ที่เกิน ~200 บรรทัดให้หยุดยืนยันก่อน
