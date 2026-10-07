# Unit: Roster & Classroom Management

## Purpose
จัดการโครงสร้างชั้นเรียน (Classroom), สมาชิกและบทบาท (Owner, Co-teacher, TA, Student), การแบ่งกลุ่ม (Groups), และการนำเข้ารายชื่อผ่านไฟล์ CSV อย่างปลอดภัยและ Atomic

## Responsibilities
- **Classroom Lifecycle**: สร้าง, กำหนดโดเมนอีเมลที่อนุญาต (`allowed_email_domains`), ตั้งค่า Timezone, และ Archive
- **Atomic CSV Roster Import (FR-CLASS-01/02/03)**:
  - Import fields: `email`, `group_name`, `student_id` (optional), `display_name` (optional)
  - All-or-nothing atomicity: หากมีข้อผิดพลาดแม้แต่แถวเดียว ให้ปฏิเสธทั้งไฟล์และระบุเลขแถวที่ผิด
  - Validation: ตรวจสอบรูปแบบอีเมล, อีเมลซ้ำ, กลุ่มว่าง, กลุ่มที่มีสมาชิก < 2 คน
  - ป้องกัน CSV Formula Injection โดยการ escape เซลล์ที่ขึ้นต้นด้วย `=`, `+`, `-`, `@` (FR-SEC-04)
- **User Normalization (FR-AUTH-03)**:
  - ตัดช่องว่าง, แปลงเป็นตัวพิมพ์เล็ก (lowercase), ลบ tag `+tag` และ dot ในกรณี Gmail
- **RBAC Enforcement (FR-AUTHZ-01/02)**:
  - กำกับบทบาท Owner, Co-teacher, TA, Student อย่างเคร่งครัดที่ server side
  - ป้องกันการลบ Owner คนสุดท้าย (FR-CLASS-06)

## NOT Responsible For
- การสร้างคู่ประเมิน (หน้าที่ของ Pairing Engine)
- การบันทึกผลการประเมิน
