import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-thai";
import "./globals.css";
import "./design.css";
import Link from "next/link";
import { demoEnabled } from "../demo/config";
import { SessionRefresh } from "../components/session-provider";
export const metadata: Metadata = {
  title: "PairEval · ประเมินอย่างมีเหตุผล",
  description: "ระบบประเมินผลงานกลุ่มและการมีส่วนร่วมด้วยการเปรียบเทียบเป็นคู่",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        {demoEnabled() && <aside className="shell notice" data-testid="demo-banner" aria-label="โหมดสาธิต" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><strong>DEMO · ข้อมูลสมมติ ไม่ใช่คะแนนจริง</strong><Link href="/login" className="button secondary small" data-testid="demo-switch">สลับบัญชี</Link></div>
        </aside>}
        <SessionRefresh />
        {children}
      </body>
    </html>
  );
}
