# Local Demo — separate from the deployed classroom system

Requirements: Node.js 22, `npm ci`, Docker Desktop with Engine running. Run `npm run demo` from the repository root. The runner creates a new disposable PostgreSQL database, migrates, seeds synthetic data, builds and starts Next.js. Open **http://localhost:3101/login**. No Google account or password is needed.

## ขั้นตอนรันและเปิดรอบเดิม

1. เปิด Docker Desktop รอ Engine running แล้วเปิด PowerShell ในโฟลเดอร์โปรเจกต์
2. ครั้งแรกใช้ `npm ci` และ `npx playwright install chromium` จากนั้นใช้ `npm run demo`
3. รอข้อความ Ready แล้วเปิด http://localhost:3101/login เลือกบัญชีสาธิต เก็บหน้ารันและ Docker ไว้ตลอด
4. ถ้าเว็บหยุดแต่ container `paireval-demo-…` ยังอยู่ ใช้ `npm run demo:resume` ตัวรันจะตรวจฐานข้อมูล local เดิม, migrate, build และเปิดเว็บ โดยไม่ seed หรือล้างคำตอบ ต้องเลือกบัญชีใหม่
5. ถ้ามีหลาย container ใช้ `docker ps --filter name=paireval-demo` แล้วระบุ `npm run demo:resume -- --container ชื่อที่เลือก`
6. ถ้าไม่มี container เดิม ข้อมูลชั่วคราวรอบนั้นกู้ด้วย resume ไม่ได้ ใช้ `npm run demo` เพื่อเริ่มรอบใหม่

`demo:resume` หยุดเฉพาะเว็บเมื่อกด Ctrl+C และเก็บ container เดิมไว้ ส่วน `demo` ปกติจะลบ container ของตนเมื่อกด Ctrl+C ทั้งสองคำสั่งตรวจพอร์ต 3101 ก่อนเริ่มเพื่อไม่ build ทับเว็บที่กำลังใช้

## สร้างงานประเมินสำหรับห้องใหม่

1. เข้าเป็นอาจารย์ → สร้างห้องเรียน กำหนด domain `demo.invalid` → เข้าห้องนั้น
2. นำเข้า CSV นักศึกษาที่อยู่ในตัวเลือก Demo แล้วบันทึกลิงก์ผลงานให้ครบทุกกลุ่มก่อน Publish
3. กด **＋ สร้างงานประเมิน** ใต้รายการงาน กรอกชื่อ เวลาเริ่มก่อนเวลาสาธิต และเวลาปิดหลังจบสาธิต
4. ใช้คะแนนกลุ่ม 15 / รายบุคคล 5 เกณฑ์กลุ่ม **คุณภาพผลงาน** 100% และรายบุคคล **การมีส่วนร่วมในทีม** 100% แล้วกด **บันทึกฉบับร่าง**
5. เปิดงาน → **ภาพรวม → ตรวจสอบจำนวนคู่และภาระงาน** → ยอมรับ coverage ที่ลดลงตามข้อจำกัด → **Publish งานประเมิน**
6. นักศึกษาตอบและกดส่งแยกส่วน **ประเมินกลุ่ม / ประเมินเพื่อน**; การบันทึกอัตโนมัติเป็นเพียงฉบับร่าง
7. กลุ่มละ 3 คนให้อาจารย์ใช้ไกด์ **อาจารย์ต้องทำอะไรต่อ** รับคู่ที่แนะนำ ตอบและกดส่งทีละคู่ จนไม่มีนักศึกษาที่ขาดผู้ประเมิน; กลุ่มละ 4 คนไม่ต้องเพิ่มอาจารย์ถ้าเพื่อนทุกคนส่งครบ
8. อาจารย์ตรวจรายงาน กรอกเหตุผลในภาพรวม → **ปิดรับประเมิน → Finalize คะแนน** → ดาวน์โหลดคะแนน CSV

## ห้องตัวอย่างที่เตรียมไว้

- Choose the demo teacher or student 01–12. The banner **DEMO · ข้อมูลสมมติ ไม่ใช่คะแนนจริง** stays visible. Use **สลับบัญชี** to return to the selector; switching reloads the app to clear the previous identity's client state.
- The classroom has 3 groups of 4, one open assignment, artifact links to example.com and no submitted answers. Group coverage falls from the default 5 to 4 explicitly, matching the PRD §8.2 small-class example. Each student has one group pair and three individual pairs.
- For three testers: one handles the teacher, and share students 01–04, 05–08 and 09–12 among yourselves. Select and submit answers for each identity in both evaluation tabs. Merely importing an account never supplies answers on its behalf.
- Below 3 distinct evaluators the individual's score stays hidden. After everyone submits, switch to the teacher to inspect reports, export, close and finalize. Scores and anonymity use the real engines without relaxed thresholds.
- At the top of each published assignment, teachers see **อาจารย์ต้องทำอะไรต่อ**: students needing more evaluators, students waiting for existing evaluators to submit, and suggested individual pairs. Select a pair and choose **รับคู่นี้และไปประเมิน**; finish and submit received work before taking another suggestion. Use **อัปเดตสถานะ** after other people submit. Groups of 3 need an additional distinct evaluator; suggestions shrink as existing assignments cover the missing students.
- Stop with **Ctrl+C**. The runner stops its own container; its temporary data disappears. Run `npm run demo` again to start fresh. There is no HTTP reset or seed endpoint.
- The database binds only to loopback; the server listens at 127.0.0.1:3101. Use one laptop/shared screen, or independent local runs on each machine (those do not share answers). This is not an online shared demo.

Isolation: `DEMO_MODE=true` is accepted only for a loopback HTTP site and a loopback database named exactly `paireval_demo`. Vercel indicators, cloud hosts and any other database name are rejected. The demo uses fresh random database/session secrets held only in environment variables. The runner never reads the production connection or reuses a production session secret. Google is the only provider when demo is off. Do not set `DEMO_MODE` in Vercel.

PRD trace: FR-AUTH-01 remains enforced in the real app; this selector is a local testing tool, not an alternative production authentication method. FR-SEC-05 forbids production seed/reset endpoints; seeding exists only in a local CLI that refuses non-demo targets. FR-AUTHZ-01/02 and FR-ANON-01/02 are exercised without bypasses.

Automated proof: `npm run test:demo` creates an isolated DB and exercises actual CSRF-protected credential login, account switching, answer submission for all 12 students, anonymity thresholds, reports and finalization. It also rejects unlisted identities. Normal E2E checks assert that the deployed-mode provider list and login screen contain no demo provider.
