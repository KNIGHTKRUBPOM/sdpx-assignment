# Unit: Evaluation Session

## Purpose
จัดการประสบการณ์การประเมินของนักศึกษา (Group & Individual Evaluation UI และ API Handlers) รวมถึง Autosave Draft, Idempotent Submission, และ Anonymity Protection

## Responsibilities
- **Autosave Draft (FR-EVAL-04, FR-API-01)**:
  - `PUT /api/comparisons/{pairAssignmentId}` รองรับ autosave แบบ idempotent
  - บันทึก `time_on_task_ms` สำหรับใช้ตรวจ Integrity Signals (QS-05 Speed run)
  - ไม่นำ draft ที่ยังไม่ submit ไปคำนวณคะแนน (FR-EVAL-09)
- **Batch Submission & Re-submit (FR-EVAL-05/06, FR-API-02)**:
  - `POST /api/assignments/{id}/submissions` รับ `Idempotency-Key` ป้องกันการกดซ้ำ
  - อนุญาตให้ Re-submit ได้ไม่จำกัดครั้งก่อน deadline
  - บันทึกประวัติทุกเวอร์ชันลง `comparison_revision` และใช้ submission ล่าสุดเสมอ
- **Privacy & Anonymity Enforcement (FR-ANON-01/02/03)**:
  - ห้ามนักศึกษาเข้าถึงตัวตนของผู้ประเมินตนเองไม่ว่าจะผ่าน API หรือ UI
  - บังคับใช้ k-anonymity threshold ($k \ge 3$) ก่อนเปิดเผยคะแนนรายบุคคล
  - ไม่แสดงคะแนนเปลี่ยนแปลงรายวัน (Delta) เพื่อป้องกันการคาดเดาตัวตนเพื่อน
- **Accessibility & UX**:
  - รองรับ WAI-ARIA APG Radio Group Pattern
  - Mobile-first responsive UI (≥ 320px)
