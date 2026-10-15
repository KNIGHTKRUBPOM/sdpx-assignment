import { Pending } from "../components/pending";
export default function Loading() {
  return <main className="shell content" aria-busy="true"><Pending text="กำลังเปิดหน้า…" /></main>;
}
