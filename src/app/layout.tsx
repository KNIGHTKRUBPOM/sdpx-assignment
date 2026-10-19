import type { Metadata } from "next";
import "./globals.css";
import "./design.css";
export const metadata: Metadata = {
  title: "PairEval · ประเมินอย่างมีเหตุผล",
  description: "ระบบประเมินผลงานกลุ่มและการมีส่วนร่วมด้วยการเปรียบเทียบเป็นคู่",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
