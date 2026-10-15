import { Header, Footer } from "../../components/header";
import { GoogleLogin } from "../../components/google-login";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
          <h1>เข้าสู่ห้องเรียนของคุณ</h1>
          <p>
            ใช้บัญชี Google ที่อาจารย์เพิ่มไว้ในรายชื่อห้องเรียน
            ระบบจะแสดงงานตามสิทธิ์ของคุณ
          </p>
          {error && (
            <div className="error" role="alert">
              เข้าสู่ระบบไม่สำเร็จ กรุณาใช้บัญชี Google ที่ยืนยันอีเมลแล้ว
              หรือบัญชี Google Workspace ของมหาวิทยาลัย
            </div>
          )}
          <GoogleLogin configured={configured} />
          <hr />
          <p className="muted">
            เราไม่เก็บรหัสผ่าน Google ของคุณ
            และนักศึกษาคนอื่นจะไม่เห็นว่าใครเป็นผู้ประเมิน
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
