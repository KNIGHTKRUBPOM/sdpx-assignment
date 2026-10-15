import Link from "next/link";
import { LinkPending } from "./pending";
export function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="PairEval หน้าหลัก">
        <span className="brand-mark">≋</span>PairEval
        <span className="badge optional">PILOT</span>
      </Link>
      <nav className="nav" aria-label="เมนูหลัก">
        <Link className="optional" href="/privacy">
          ความเป็นส่วนตัว
        </Link>
        <Link
          href="/dashboard"
          className="button small"
          data-testid="dashboard-link"
        >
          ห้องเรียนของฉัน ↗
          <LinkPending />
        </Link>
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <span>PairEval · ประเมินอย่างมีเหตุผล</span>
      <span>SDPX PROJECT / 2026</span>
    </footer>
  );
}
