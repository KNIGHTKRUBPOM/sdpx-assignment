import Link from "next/link";
import { LinkPending } from "./pending";
export function Header() {
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="PairEval หน้าหลัก">
        <span className="brand-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M5 7h5M5 12h5M5 17h5M14 7h5M14 12h5M14 17h5" />
            <path d="m9 5 2 2-2 2m6 6-2 2 2 2" />
          </svg>
        </span>
        PairEvalEiEi
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
