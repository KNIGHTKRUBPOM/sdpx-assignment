import { Header, Footer } from "../../components/header";
import { GoogleLogin } from "../../components/google-login";
import { DemoLogin } from "../../components/demo-login";
import { demoAccounts, demoEnabled } from "../../demo/config";
import { InitialErrorPopup } from "../../components/error-popup";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const demo = demoEnabled();
  const configured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.DATABASE_URL &&
    process.env.NEXTAUTH_SECRET
  );
  return (
    <div className="shell">
      <Header />
      <main className="login-wrap">
        <span className="eyebrow">WELCOME TO PAIREVAL</span>
        <div className="card">
          <h1>{demo ? "ลองใช้งาน PairEval" : "เข้าสู่ห้องเรียนของคุณ"}</h1>
          <p>
            {demo ? "เลือกอาจารย์หรือนักศึกษาสาธิตเพื่อทดลองประเมิน สลับบัญชีได้โดยไม่ต้องใช้ Google หรือรหัสผ่าน" : "ใช้บัญชี Google ที่อาจารย์เพิ่มไว้ในรายชื่อห้องเรียน ระบบจะแสดงงานตามสิทธิ์ของคุณ"}
          </p>
          {error && <InitialErrorPopup key={error} message={demo ? "เข้าสู่บัญชีสาธิตไม่สำเร็จ กรุณาเลือกบัญชีแล้วลองใหม่" : "เข้าสู่ระบบไม่สำเร็จ กรุณาใช้บัญชี Google ที่ยืนยันอีเมลแล้ว หรือบัญชี Google Workspace ของมหาวิทยาลัย"} />}
          {demo ? <DemoLogin accounts={demoAccounts} /> : <GoogleLogin configured={configured} />}
          <hr />
          <p className="muted">
            {demo ? "ใช้ข้อมูลสมมติทั้งหมด คำตอบจะเกิดขึ้นเมื่อผู้ทดสอบเลือกและกดส่งเอง เริ่มใหม่ได้เมื่อเปิด Demo รอบใหม่" : "เราไม่เก็บรหัสผ่าน Google ของคุณ และนักศึกษาคนอื่นจะไม่เห็นว่าใครเป็นผู้ประเมิน"}
          </p>
          <a
            className="muted"
            href="/privacy"
            style={{ textDecoration: "underline" }}
          >
            อ่านประกาศความเป็นส่วนตัว →
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
