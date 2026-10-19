"use client";
import { useLinkStatus } from "next/link";

export function Pending({ text = "กำลังดำเนินการ…" }: { text?: string }) {
  return <span className="pending" role="status" data-testid="pending-status"><span className="spinner" aria-hidden="true" />{text}</span>;
}

export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <Pending text="กำลังเปิดหน้า…" /> : null;
}
