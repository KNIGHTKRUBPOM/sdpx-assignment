"use client";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Pending } from "./pending";
import { ErrorPopup } from "./error-popup";

export function DemoLogin({ accounts }: { accounts: { email: string; name: string }[] }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const email = String(new FormData(event.currentTarget).get("email"));
    setBusy(true); setError("");
    try {
      const result = await signIn("demo", { email, redirect: false, callbackUrl: "/dashboard" });
      if (!result || result.error) throw new Error("เข้าสู่บัญชีสาธิตไม่สำเร็จ กรุณาลองใหม่");
      // Full navigation clears the previous identity's client-side workspace state.
      window.location.assign(new URL("/dashboard", window.location.origin).href);
    } catch (e) { setError(e instanceof Error ? e.message : "ระบบขัดข้อง"); setBusy(false); }
  }
  return <form className="stack" onSubmit={submit}>
    <label>เลือกบัญชีสาธิต<select name="email" data-testid="demo-account" disabled={busy}>
      {accounts.map((a) => <option key={a.email} value={a.email}>{a.name}</option>)}
    </select></label>
    <ErrorPopup error={error} onDismiss={() => setError("")} />
    <button className="button full" data-testid="demo-login" disabled={busy}>
      {busy ? <Pending text="กำลังสลับบัญชี…" /> : "เข้าสู่ Demo →"}
    </button>
  </form>;
}
