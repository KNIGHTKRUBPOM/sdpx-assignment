# PairEval — ระบบประเมินผลนักศึกษาแบบ Pairwise Comparison

> **CE-SDPX Project** — พัฒนาตามข้อกำหนดใน [PRD-PAIREVAL v2.0](pairwise_evaluation_prd.md)  
> ระบบประเมินผลงานกลุ่มและผลงานรายบุคคลของนักศึกษาด้วยวิธีจับคู่เปรียบเทียบ (Pairwise Comparison) เพื่อขจัดอคติการให้คะแนนเดี่ยว และแก้ปัญหาการเกาะเพื่อนทำงาน (Free-rider)

---

## 📌 1. โปรเจกต์นี้ทำอะไร (Project Overview)

การประเมินผลงานนักศึกษาแบบเดิมมักเผชิญปัญหา 3 ด้านหลัก:
1. **Absolute scoring bias:** มาตรฐานการให้คะแนนเดี่ยวเปลี่ยนไปตามเวลาและความเหนื่อยล้าของผู้ตรวจ
2. **Free-rider problem:** สมาชิกกลุ่มที่ไม่ทำงานกลับได้คะแนนเท่ากับคนที่ทำงานจริง
3. **Peer rating inflation:** เมื่อให้นักศึกษาให้คะแนนเพื่อนเป็นตัวเลข ส่วนใหญ่มักให้คะแนนเต็มกันหมด

**PairEval** แก้ปัญหานี้ด้วยสมมติฐานว่า *"มนุษย์สามารถเปรียบเทียบความแตกต่างระหว่างสองสิ่ง (A หรือ B ดีกว่า) ได้แม่นยำและสม่ำเสมอกว่าการให้คะแนนเดี่ยว"* ระบบจึงเก็บเฉพาะผลการจับคู่เปรียบเทียบ แล้วนำมาคำนวณคะแนนเชิงสถิติภายหลัง

### คุณสมบัติหลักของระบบ (Core Features)
- **Pairing Engine (Pure Function):** คำนวณความเป็นไปได้ (Feasibility) อัตโนมัติ จัดสรรคู่เปรียบเทียบอย่างสมดุล (INV-1 ถึง INV-5) โดยใช้ Seeded PRNG ป้องกันการได้คู่ตัวเองหรือกลุ่มตัวเอง
- **Scoring Engine (Pure Function):** แปลง 6-point forced choice เป็น Quality Index $q \in [0, 1]$ แล้วแปลงเป็นคะแนนผ่าน Band Mapping (ฐาน 60% ถึง 100%) พร้อมคิดตัวคูณการมีส่วนร่วม ($M$) แยกขาดจากคะแนนกลุ่ม
- **Integrity & Quality Signals:** ตรวจจับพฤติกรรมการประเมินที่ผิดปกติ 7 รูปแบบ (QS-01 ถึง QS-07) เช่น Straight-lining, Position bias, Intransitivity (ตรรกะวนลูป A>B, B>C, C>A), และ Speed runs
- **Privacy & Anonymity Protection:** ปกป้องตัวตนผู้ประเมินตามกฎ PDPA ซ่อนคะแนนรายบุคคลหากผู้ประเมินยังไม่ถึงเกณฑ์ $k$-anonymity ($k \ge 3$) และไม่แสดง delta รายวัน
- **Atomic CSV Roster & Security Sanitizer:** นำเข้ารายชื่อนักศึกษาแบบ All-or-nothing (หากผิดพลาดแม้แต่แถวเดียวจะปฏิเสธทั้งไฟล์พร้อมระบุเลขแถว) และป้องกัน CSV Formula Injection
- **Evaluation Web UI:** หน้าเว็บประเมินผลรองรับ Mobile-first (≥320px), Accessible Radio Group ตาม WAI-ARIA APG, และระบบ Autosave พร้อม `aria-live="polite"`

---

## 🛠️ 2. การติดตั้งและเตรียมระบบ (Prerequisites & Setup)

- **Node.js:** เวอร์ชั่น 20 หรือสูงกว่า
- **Package Manager:** npm

```bash
# ติดตั้ง dependencies ทั้งหมด
npm install
```

---

## 🧪 3. ขั้นตอนการทดสอบอย่างละเอียด (Testing & Verification Guide)

ระบบมีชุดทดสอบครอบคลุมทั้ง Unit Test, Property-Based Test, Golden Test, Spec Linting และ End-to-End Integration Test ทั้งหมด 43 tests (ผ่าน 100%)

### 3.1 รันการทดสอบทั้งหมด (Automated Test Suite)

```bash
npm test
```

คำสั่งนี้จะรัน **Vitest** ครอบคลุม 6 Test Suites ดังนี้:

| ไฟล์ทดสอบ | สิ่งที่ตรวจสอบ | Requirement ใน PRD |
|---|---|---|
| [`tests/scoring.test.ts`](tests/scoring.test.ts) | **Golden Test (§9.5):** ทดสอบสูตรการคำนวณเทียบกับ Worked Example ของกลุ่ม Aurora (12.798/15), นก (16.93/20) และต้น (10.97/20) รวมถึงการแยกคะแนนกลุ่มจากคะแนนเดี่ยว | FR-SCORE-01 ถึง 11, §9.5 |
| [`tests/pairing.test.ts`](tests/pairing.test.ts) | **Property-Based Testing:** ใช้ `fast-check` สุ่มขนาดกลุ่มและห้องเรียนเพื่อทดสอบ Invariants ทางคณิตศาสตร์ 5 ข้อ (INV-1 ถึง INV-5), Feasibility checks และ Complete Enumeration ($m-2$) | FR-PAIR-01 ถึง 14, §8.4 |
| [`tests/quality-signals.test.ts`](tests/quality-signals.test.ts) | **Quality Signals:** ตรวจสอบสัญญาณความผิดปกติ QS-01 (Low coverage), QS-02 (Straight-lining), QS-03 (Position bias), QS-04 (Intransitivity), QS-05 (Speed run) และ QS-07 (Kendall's W) | FR-QS-01, §10 |
| [`tests/roster.test.ts`](tests/roster.test.ts) | **CSV Roster Parser:** ทดสอบ Atomic import (ปฏิเสธทั้งไฟล์เมื่อพบแถวที่ผิด เช่น row 42), ตรวจสอบอีเมลซ้ำ, กลุ่มขนาด < 2 และการ Escape Formula Injection (`=`, `+`, `-`, `@`) | FR-CLASS-02, 03, FR-SEC-04 |
| [`tests/reports.test.ts`](tests/reports.test.ts) | **Reports & Anonymity:** ทดสอบ $k$-anonymity threshold ($k \ge 3$), การแทนที่ตัวตนด้วย Pseudonym ID และการ Export CSV ภาษาไทยพร้อม UTF-8 BOM (`\uFEFF`) | FR-ANON-02, FR-EXPORT-01 |
| [`tests/api.test.ts`](tests/api.test.ts) | **Walking Skeleton (E2E Integration):** ทดสอบครบ 14 ขั้นตอน ตั้งแต่สร้าง Classroom, นำเข้า Roster, สร้าง Assignment, Publish, จำลองการทำแบบประเมิน, Autosave, Submit พร้อม Idempotency-Key, ตรวจสอบคะแนน, Finalize, เรียกดู Quality Report จนถึง Export CSV | PRD §19 (M1 Walking Skeleton), §12 |

---

### 3.2 ตรวจสอบความถูกต้องของ API Specification (OpenAPI Linting)

```bash
npm run lint:spec
```

- ใช้ `@redocly/cli` ในการตรวจสอบความถูกต้องของสัญญา API ใน [`docs/openapi.yaml`](docs/openapi.yaml) ตามมาตรฐาน OpenAPI 3.1
- **เกณฑ์ที่ผ่าน:** 0 errors, 0 warnings

---

### 3.3 ตรวจสอบ Type Safety (TypeScript Strict Mode)

```bash
npm run typecheck
```

- ตรวจสอบความสอดคล้องของ Type ทั้งหมดในโปรเจกต์ด้วย `tsc --noEmit`
- **เกณฑ์ที่ผ่าน:** 0 type errors

---

### 3.4 คอมไพล์โปรเจกต์ (Build)

```bash
npm run build
```

- คอมไพล์ TypeScript โค้ดทั้งหมดลงในโฟลเดอร์ `dist/`

---

## 🚀 4. การรันเซิร์ฟเวอร์ในโหมดพัฒนา (Development Server)

```bash
npm run dev
```

- เริ่มต้น REST API Server และ Evaluation UI บนพอร์ต `http://localhost:3000`
- สามารถเข้าผ่านเบราว์เซอร์เพื่อทดลองใช้งานหน้าจอประเมินผลจริงแบบโต้ตอบได้ทันที

---

## 📂 5. โครงสร้างโปรเจกต์ (Project Structure)

```text
├── src/
│   ├── core/
│   │   ├── pairing/          # อัลกอริทึมจัดคู่เปรียบเทียบ (Pairing Engine)
│   │   ├── scoring/          # ตรรกะการคิดคะแนนและตัวคูณ (Scoring Engine)
│   │   ├── quality-signals/  # ระบบตรวจจับสัญญาณความผิดปกติ (QS-01 ถึง QS-07)
│   │   ├── roster/           # ตัวจัดการและตรวจสอบไฟล์รายชื่อ CSV แบบ Atomic
│   │   ├── reports/          # ระบบสร้างรายงาน, k-anonymity, และ Export BOM CSV
│   │   └── types.ts          # Type Definitions หลักทั้งหมดของโดเมน
│   ├── server/               # Express REST API และ HTML Evaluation UI
│   └── storage/              # In-memory Datastore และ Append-only Audit Log
├── tests/                    # ชุดทดสอบอัตโนมัติครบทุกโมดูล
├── docs/
│   ├── openapi.yaml          # สัญญา REST API ตามมาตรฐาน OpenAPI 3.1
│   ├── architecture.md       # เอกสารสถาปัตยกรรมระบบ
│   └── adr/                  # บันทึกการตัดสินใจทางสถาปัตยกรรม (ADR-001 ถึง ADR-003)
├── memory-bank/              # บริบทและข้อกำหนดระบบสำหรับการพัฒนาด้วย AI Agent
├── AGENTS.md                 # กฎและข้อตกลงในการทำงานของ AI Agent
├── LOOP_NOTES.md             # บันทึกรอบการทำงานแบบ Loop Engineering
└── pairwise_evaluation_prd.md# เอกสารความต้องการผลิตภัณฑ์ (PRD v2.0 ฉบับสมบูรณ์)
```