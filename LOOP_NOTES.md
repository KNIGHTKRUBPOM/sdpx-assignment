# LOOP_NOTES.md — บันทึก Loop Engineering (วิชา CE-SDPX)

บันทึกสถิติและข้อสังเกตการทำงานร่วมกับ AI Agent ตามกระบวนการ Loop Engineering (Context → Plan → Act → Verify → Feedback)

---

## 1. จำนวนรอบที่ AI วนกว่า Test จะเขียว

### รอบที่ 1 — Core Engines (Scoring & Pairing Engine)
- **จำนวนรอบ:** 2 รอบ (Red → Green)
- **สิ่งที่ตรวจพบในรอบแรก:**
  1. *Feasibility Message Assertion:* ข้อความแจ้งเตือนห้องเรียนขนาดเล็กขาดคีย์เวิร์ดภาษาไทยตามที่ test คาดหวัง
  2. *Property-Based Test Failure (INV-3):* `fast-check` สุ่มพบ edge case $N=6, m=3, \text{seed}=1$ ที่ทำให้ส่วนต่างของ coverage เป็น 2 (เกินเกณฑ์ $\le 1$) เนื่องจากการจัดสรรคู่แบบ greedy sorting เพียงอย่างเดียวไม่สามารถรับประกันความสมดุลในกรณีที่มีข้อจำกัดห้ามประเมินกลุ่มตนเอง
- **การแก้ไขใน Loop:**
  - เพิ่ม Interleaved group distribution เพื่อกระจายคิวของกลุ่มให้เท่าเทียมกัน
  - เพิ่ม 2-step augmenting swap algorithm เพื่อปรับสมดุล coverage ของคู่ที่มีค่าสูงสุดและต่ำสุด
- **ผลลัพธ์รอบที่สอง:** **ผ่าน 13/13 tests (100%)** รวมถึง Golden Test Worked Example §9.5 (Aurora Group, Nok, Ton)

---

### รอบที่ 2 — REST API, Roster & Quality Signals (Walking Skeleton)
- **จำนวนรอบ:** 2 รอบ (Red → Green)
- **สิ่งที่ตรวจพบในรอบแรก:**
  1. *Express 5 Routing:* `path-to-regexp` ไม่ยอมรับ `:id:publish` ตรง ๆ จึงเปลี่ยนมาใช้ Regex matching
  2. *UTF-8 BOM Assertion:* `res.text()` ของ WHATWG Fetch API ตัดอักขระ BOM (`\uFEFF`) ออกอัตโนมัติ ทำให้การตรวจสอบ string ล้มเหลว
- **การแก้ไขใน Loop:**
  - ปรับการตรวจสอบ BOM ไปที่ระดับ Byte Buffer (`0xEF, 0xBB, 0xBF`) เพื่อยืนยันว่า HTTP payload แนบ BOM จริงสำหรับ Excel ภาษาไทย
- **ผลลัพธ์รอบที่สอง:** **ผ่าน 43/43 tests (100%)** ภายใน 1.71 วินาที

---

### รอบที่ 3 — Typecheck & Spec Linting Gate
- **จำนวนรอบ:** 2 รอบ (Red → Green)
- **สิ่งที่ตรวจพบ:** TypeScript strict mode ฟ้อง type ของ Express 5 route params (`string | string[]`)
- **การแก้ไข:** เพิ่ม type-safe extractor helper `getParam(req, key)`
- **ผลลัพธ์รอบที่สอง:** `tsc --noEmit` ผ่าน 0 errors, `tsc` build ผ่าน, และ `@redocly/cli lint` ผ่าน 100%

---

## 2. มีรอบไหนที่ Test แดงแล้ว AI แก้ถูกทันทีไหม?

- **มี และตรงจุดทุกรอบ:**
  1. **กรณี Invariant INV-3:** AI ไม่ได้ลดหย่อนหรือแก้ไขเงื่อนไขของ test (ปฏิบัติตามกฎของ `AGENTS.md`) แต่เขียน simulation script เพื่อทดสอบ combinatorial algorithm ทุกขนาดกลุ่ม $N \in [3..10], m \in [3..8]$ และสร้าง 2-step augmenting transfer จนกระทั่ง invariant INV-3 ผ่านอย่างสมบูรณ์
  2. **กรณี UTF-8 BOM:** AI สามารถชี้แจงสาเหตุเชิงลึกได้ทันทีว่าเกิดจาก WHATWG Encoding Standard ของ Fetch API และเปลี่ยนวิธีตรวจเป็น raw buffer check โดยไม่แตะต้องตรรกะฝั่ง server

---

## 3. ถ้า "ไม่มี" Test ให้ AI รันเลย คุณคิดว่าผลจะต่างไปอย่างไร?

1. **Bug เชิงสถิติจะหลุดไปถึงผู้ใช้จริง:**
   - ปัญหา coverage ไม่สมดุลใน Pairing Engine จะเกิดขึ้นเฉพาะในห้องเรียนบางขนาด (เช่น $N=6, m=3$) หากไม่มี Property-Based Test สุ่มหา edge case ระบบจะดูเหมือนใช้งานได้ปกติในตอนแรก แต่จะเกิดความไม่ยุติธรรมในการประเมินจริง
2. **Golden Formula จะคลาดเคลื่อน:**
   - สูตรคำนวณ Band Mapping และตัวคูณ Participation $M$ หากไม่มี Golden Test เทียบกับ Worked Example §9.5 (Aurora 12.798, Nok 16.93, Ton 10.97) อาจเกิด floating-point rounding error หรือความเข้าใจผิดเรื่องการตัดคะแนนกลุ่ม
3. **Spec Creep & Breaking Contracts:**
   - หากไม่มีการรัน `@redocly/cli lint` OpenAPI spec อาจมี syntax ผิดพลาดและไม่ตรงกับ API ที่พัฒนาจริง
4. **สรุป:** การมี Test Harness และ Verification Gate ที่รวดเร็ว (<2 วินาที) คือสิ่งที่เปลี่ยน AI จาก "เครื่องมือช่วยเดาโค้ด" ให้กลายเป็น "คู่คิดวิศวกรรมซอฟต์แวร์ที่เชื่อถือได้" ตามแก่นของวิชา SDPX
