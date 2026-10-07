# Unit: Pairing Engine

## Purpose
คำนวณความเป็นไปได้ (Feasibility) และจัดสรรคู่ประเมิน (Pair Assignment) ทั้ง Group และ Individual Evaluation อย่างสมดุล (Balanced Coverage), ยุติธรรม (Fair Workload), และ Deterministic โดยไม่มี evaluator ใดประเมินตนเองหรือกลุ่มตนเอง

## Responsibilities
- **Group Feasibility Solver (§8.2)**: คำนวณ `R` (เป้าหมาย), `slots_needed`, `k` (workload ต่อคน) พร้อมตรวจสอบ 3 constraints:
  1. $k \le P - (N - 1)$
  2. $k \le k_{max}$
  3. $R \le \min_{(a,b)} (S - |a| - |b|)$
  หากไม่ผ่าน ต้องปรับลด $R$ สู่ค่าสูงสุดที่เป็นไปได้ และรายงานเหตุผลเป็นตัวเลข (FR-PAIR-05)
- **Group Pair Generator (§8.4)**:
  - สุ่มจัดสรรคู่ประเมินด้วย seeded PRNG (FR-PAIR-09)
  - ห้าม evaluator ประเมินคู่ที่มีกลุ่มตนเอง (FR-PAIR-02, INV-1)
  - ห้าม evaluator ได้รับคู่เดิมซ้ำใน criterion เดียวกัน (FR-PAIR-07, INV-2)
  - Balanced coverage: $\max(coverage) - \min(coverage) \le 1$ (FR-PAIR-06, INV-3)
  - Balanced evaluator workload: ต่างกันไม่เกิน 1 คู่ (INV-4)
  - สุ่มตำแหน่งซ้าย/ขวา (Display Left Item ID) เพื่อกำจัด position bias (FR-PAIR-08, D8)
- **Individual Pair Generator (§8.3)**:
  - Complete enumeration ภายในกลุ่ม: $C(m, 2)$ pairs
  - ตัดคู่ที่มี evaluator อยู่: $C(m-1, 2)$ pairs ต่อคน
  - Coverage สูงสุดที่เป็นไปได้คือ $m - 2$
  - ตรวจสอบขนาดกลุ่ม: หาก $m \le 2$ ยกเลิกการประเมินรายบุคคลพร้อมเหตุผล; หาก $m = 3$ flag `LOW_CONFIDENCE`
  - หาก workload เกิน $k_{max}$ ให้สุ่มเลือกอย่างสมดุล (FR-PAIR-14)

## NOT Responsible For
- การเก็บรักษาสถานะหรือ persistence ลงฐานข้อมูลโดยตรง (API layer เป็นผู้ persist)
- การบันทึกและแปลงคะแนน comparison (เป็นหน้าที่ของ Scoring Engine)
- สิทธิ์การเข้าถึงข้อมูล (Authorization layer)

## Dependencies
- Depends on: Roster & Classroom entities (Student list, Group affiliations)
- Used by: Assignment Service (ตอน publish assignment หรือ add extra evaluators)
