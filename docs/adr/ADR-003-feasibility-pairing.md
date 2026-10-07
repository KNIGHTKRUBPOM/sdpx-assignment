# ADR-003: Dynamic Feasibility Analysis and Balanced Pairing Engine

## Context
ในการจัดสรรคู่ประเมิน (Pair Allocation) ตัวแปร Coverage ($R$) และ Workload ต่อคน ($k$) ผูกกันในเชิงคณิตศาสตร์:
$$P = \frac{N(N-1)}{2}, \quad \text{slots} = P \times R, \quad k = \left\lceil \frac{\text{slots}}{S} \right\rceil$$

หากระบบบังคับ fix ทั้ง $R = 5$ และ $k = 5$ จะเกิดภาวะ Infeasible ทันทีในห้องเรียนขนาดเล็กหรือห้องที่มีจำนวนกลุ่มน้อย (เช่น $N=3, S=12$ ซึ่งนักศึกษา 1 คนมีสิทธิ์ประเมินได้มากสุดเพียง $P - (N-1) = 1$ คู่เท่านั้น) นอกจากนี้ หากพยายามให้ evaluator คนเดิมประเมินคู่เดิมซ้ำเพื่อเพิ่มตัวเลข coverage จะทำให้เกิดข้อมูลเอียงและเสียเวลาของนักศึกษาโดยเปล่าประโยชน์

## Decision
1. คำนวณ Feasibility ล่วงหน้าก่อน Publish Assignment เสมอ
2. ตรวจสอบข้อจำกัด 3 ประการ:
   - $k \le P - (N - 1)$
   - $k \le k_{max}$
   - $R \le \min_{(a,b)} (S - |a| - |b|)$
3. หากไม่ผ่าน ระบบจะลด $R$ ลงมายังค่าสูงสุดที่ทำได้จริง และแจ้งอาจารย์เป็นตัวเลขชัดเจน
4. บังคับ Invariants:
   - INV-1: ห้ามประเมินตนเองหรือกลุ่มตนเอง
   - INV-2: ห้ามประเมินคู่เดิมซ้ำใน criterion เดียวกัน
   - INV-3: $\max(coverage) - \min(coverage) \le 1$
   - INV-4: ส่วนต่าง workload ระหว่าง evaluators ไม่เกิน 1
   - INV-5: Deterministic เมื่อใช้ seed เดียวกัน

## Consequences
- **Positive**: ระบบจะไม่ล้มเหลวเงียบ ๆ และไม่สร้างคู่ที่ไม่สมเหตุสมผล
- **Positive**: อาจารย์ทราบตัวเลข coverage และ workload ที่แท้จริงก่อนเปิดให้นักศึกษาประเมิน
- **Trade-off**: ในห้องขนาดเล็กมาก coverage อาจลดลงต่ำกว่า 5 ทำให้ผลลัพธ์อาจมี statistical power ลดลง ระบบจึงมีกลไก flag `LOW_CONFIDENCE` เตือนให้อาจารย์ทราบ
