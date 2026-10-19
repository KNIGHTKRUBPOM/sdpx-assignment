"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Pending } from "./pending";
import { ErrorPopup } from "./error-popup";
export function GoogleLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button full"
        data-testid="google-login"
        disabled={!configured || busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl: "/dashboard" }).catch(() => { setBusy(false); setError("เชื่อมต่อ Google ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"); });
        }}
      >
        {busy ? <Pending text="กำลังเชื่อมต่อ…" /> : "เข้าสู่ระบบด้วย Google ↗"}
      </button>
      <ErrorPopup error={error} onDismiss={() => setError("")} />
      {!configured && (
        <p className="notice" style={{ marginTop: 18 }}>
          ระบบกำลังเตรียมการเชื่อมต่อ Google และฐานข้อมูล
          กรุณาติดต่อผู้ดูแลก่อนเริ่มใช้งาน
        </p>
      )}
    </>
  );
}
