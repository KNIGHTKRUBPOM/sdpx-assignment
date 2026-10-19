import Link from "next/link";
import { Header, Footer } from "../components/header";
export default function Home() {
  return (
    <div className="shell">
      <Header />
      <main>
        <section className="hero">
          <div>
            <span className="eyebrow">A FAIRER WAY TO EVALUATE</span>
            <h1>
              ทุกผลงานมีคุณค่า
              <br />
              ทุกการมีส่วนร่วม
              <br />
              <span style={{ color: "var(--deep)" }}>ควรถูกมองเห็น</span>
            </h1>
            <p>
              เปรียบเทียบทีละคู่
              เพื่อเห็นคุณภาพของงานและการมีส่วนร่วมในทีมชัดขึ้น
              ด้วยเกณฑ์เดียวกันและคะแนนที่อธิบายได้
            </p>
            <div className="hero-actions">
              <Link href="/login" className="button" data-testid="login-cta">
                เริ่มใช้งานด้วย Google <span>↗</span>
              </Link>
              <a href="#how-it-works" className="button secondary">
                ทำงานอย่างไร ↓
              </a>
            </div>
            <p className="muted" style={{ marginTop: 18 }}>
              สำหรับอาจารย์และนักศึกษา · ใช้งานได้บนมือถือ
            </p>
          </div>
          <div className="demo" aria-label="ตัวอย่างหน้าประเมิน ไม่ใช่ผลจริง">
            <div className="demo-top">
              <span>THE PAIRWISE APPROACH</span>
              <span>ตัวอย่างการประเมิน</span>
            </div>
            <div className="demo-card">
              <div className="card-top">
                <strong>ประสบการณ์ใช้งาน</strong>
                <span className="badge green">GROUP</span>
              </div>
              <p className="muted">ผลงานใดตอบโจทย์ผู้ใช้ได้ดีกว่า?</p>
              <div className="compare">
                <div className="item">
                  <span className="item-icon">◈</span>
                  <strong>Aurora</strong>
                  <span className="muted">ผลงานกลุ่ม A</span>
                </div>
                <span className="muted" style={{ textAlign: "center" }}>
                  vs
                </span>
                <div className="item">
                  <span className="item-icon">◒</span>
                  <strong>Borealis</strong>
                  <span className="muted">ผลงานกลุ่ม B</span>
                </div>
              </div>
              <div className="scale" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <span key={n} className={n === 2 ? "selected" : ""}>
                    {n}
                  </span>
                ))}
              </div>
              <div className="scale-hints">
                <span>← ซ้ายดีกว่ามาก</span>
                <span>ขวาดีกว่ามาก →</span>
              </div>
              <div className="demo-footer">
                <span>6 ระดับ · ไม่มีตัวเลือกเสมอ</span>
                <span>ทีละคู่ ทีละเหตุผล</span>
              </div>
            </div>
          </div>
        </section>
        <section className="steps" id="how-it-works">
          <article>
            <span className="step-number">01 /</span>
            <div>
              <h3>ตั้งเกณฑ์ให้ชัด</h3>
              <p>อาจารย์จัดห้องเรียน เพิ่มผลงาน และกำหนดเกณฑ์ก่อนเปิดประเมิน</p>
            </div>
          </article>
          <article>
            <span className="step-number">02 /</span>
            <div>
              <h3>เปรียบเทียบอย่างเป็นธรรม</h3>
              <p>ระบบจัดคู่ให้ โดยไม่ให้ประเมินตัวเองหรือกลุ่มของตัวเอง</p>
            </div>
          </article>
          <article>
            <span className="step-number">03 /</span>
            <div>
              <h3>เห็นผลที่ตรวจสอบได้</h3>
              <p>
                แยกคะแนนผลงานและการเข้าร่วม พร้อมให้อาจารย์ตรวจสอบก่อนยืนยัน
              </p>
            </div>
          </article>
        </section>
      </main>
      <Footer />
    </div>
  );
}
