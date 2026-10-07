# Unit: Scoring Engine

## Purpose
Pure Function engine ที่แปลงผลการเปรียบเทียบแบบ Pairwise (6-point forced choice) เป็น Quality Index $q$, คะแนนถ่วงน้ำหนักตามเกณฑ์ด้วย Band Mapping, และคำนวณคะแนนสุทธิหลังปรับด้วย Participation Multiplier $M$

## Responsibilities
- **Choice-to-Points Converter (§9.1)**:
  - แปลงตัวเลือก 1-6 และทิศทางการแสดงผล (Display Position) เป็นคะแนนของแต่ละ Item:
    - 1: ซ้ายดีกว่ามาก (1.0 vs 0.0)
    - 2: ซ้ายดีกว่า (0.8 vs 0.2)
    - 3: ซ้ายดีกว่าเล็กน้อย (0.6 vs 0.4)
    - 4: ขวาดีกว่าเล็กน้อย (0.4 vs 0.6)
    - 5: ขวาดีกว่า (0.2 vs 0.8)
    - 6: ขวาดีกว่ามาก (0.0 vs 1.0)
- **Quality Index $q(i, c)$ Computation (§9.2)**:
  - คำนวณแบบถ่วงน้ำหนัก: $q(i,c) = \frac{\sum_e (w_e \times s_{i,e})}{\sum_e w_e}$
  - รองรับ $w_e = 1.0$ สำหรับนักศึกษา และ $w_e = \text{instructor\_weight}$ (float) สำหรับอาจารย์
  - กรองเฉพาะ comparison ที่มีสถานะ `SUBMITTED`
- **Band Mapping (§9.3)**:
  - Map $q \in [0, 1]$ เข้าช่วง $[\text{floor}, \text{ceiling}]$ (default: 0.60 ถึง 1.00)
  - $\text{score\_ratio}(i, c) = \text{floor} + (\text{ceiling} - \text{floor}) \times q(i, c)$
  - คำนวณคะแนนถ่วงน้ำหนัก: $\text{weighted}(i,c) = \text{score\_ratio}(i,c) \times \text{weight}_c \times \text{max\_score\_side}$
- **Participation Penalty Multiplier $M$ (§9.4)**:
  - $p = \frac{\text{submitted\_comparisons}}{\text{assigned\_comparisons}}$
  - $M = \min(1.0, p / \text{completion\_threshold})$ (default threshold: 0.90)
  - คะแนนสุทธิ: $\text{final\_personal\_score} = (\text{group\_component} + \text{individual\_component}) \times M$
  - คะแนนของกลุ่ม **ต้องไม่ถูกลดทอน** เพราะสมาชิกคนใดคนหนึ่งไม่ประเมิน (FR-SCORE-11)
- **Integrity Flagging (§10 & FR-SCORE-05)**:
  - ติด flag `LOW_CONFIDENCE` หาก item ได้รับ comparison น้อยกว่า $\text{min\_comparisons}$ (default 3)

## NOT Responsible For
- การดึงข้อมูลจาก DB หรือ Network IO (Scoring function เป็น Pure Function ตาม AR-01)
- การบันทึก Snapshot หรือ Audit log (Caller เป็นผู้บันทึก)
- การตรวจสอบสิทธิ์ของผู้เรียก

## Dependencies
- Pure Mathematical Engine — ไม่มี external runtime dependency
- Tested against Golden Test Dataset (§9.5 Worked Example: Aurora Group, Nok, Ton)
