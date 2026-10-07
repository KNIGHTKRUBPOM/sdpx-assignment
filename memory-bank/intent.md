# Intent: PairEval (ระบบประเมินผลนักศึกษาแบบ Pairwise Comparison)

## Intent Statement
Enable fair, bias-reduced, and evidence-based peer and instructor evaluation of university group assignments through systematic pairwise comparisons, effectively resolving absolute scoring bias and the free-rider problem while safeguarding student privacy and maintaining instructor governance.

## Business Context
- **Problem Statement:**
  1. **Absolute scoring bias**: ผู้ประเมินตรวจงานแรกและงานสุดท้ายด้วยมาตรฐานต่างกัน และ anchor กับงานที่เพิ่งตรวจไป
  2. **Free-rider problem**: สมาชิกที่ไม่ทำงานได้คะแนนเท่ากับคนที่ทำจริงเพราะคะแนนผูกเป็นกลุ่มก้อนเดียว
  3. **Peer rating inflation**: เมื่อให้นักศึกษาให้คะแนนเพื่อนเป็นตัวเลขตรง ๆ ส่วนใหญ่ให้เต็มหมด ไม่เกิดการกระจายตัวของข้อมูล
- **Primary Users:**
  - **Instructor (Owner)**: ตั้ง assignment, ตรวจสอบรายงานคุณภาพ, แทรกแซง/override, finalize คะแนน
  - **Instructor (Co-teacher)**: ร่วมประเมินบางคู่, ตรวจสอบรายงาน
  - **Teaching Assistant (TA)**: จัดการ roster และช่วยเหลือนักศึกษา
  - **Student**: ทำ pairwise evaluation (Group & Individual) ภายในเวลาไม่เกิน 15 นาที และดูผลคะแนนตนเอง
- **Value Delivered:**
  - มนุษย์เปรียบเทียบ "สองสิ่งพร้อมกัน" (A vs B) ได้สม่ำเสมอและแม่นยำกว่าการให้คะแนนเดี่ยว
  - ปกป้องความเป็นส่วนตัวของนักศึกษาด้วย k-anonymity และ zero identity leakage เพื่อให้กล้าประเมินตามจริง
  - ระบบไม่ตัดสินใจตัดเกรดเอง อาจารย์ตรวจสอบและมีอำนาจแทรกแซงได้ทุกจุด

## Success Criteria (Metrics from PRD §1.4)
- **M1 Participation Rate**: ≥ 90% ของนักศึกษาทำและ submit ครบตามที่ได้รับมอบหมาย
- **M2 Median Time-on-task**: ≤ 15 นาทีต่อ assignment
- **M3 Score Dispersion (Individual)**: Standard Deviation ภายในกลุ่ม ≥ 0.5 คะแนน (จาก 5)
- **M4 Instructor Override Rate**: ≤ 5% ของคะแนนทั้งหมด
- **M5 Dispute Rate**: คำร้องอุทธรณ์คะแนน ≤ 3% ของนักศึกษา
- **M6 Low-confidence Items**: Item ที่ได้รับ comparison ไม่ถึงเกณฑ์ ≤ 5%
