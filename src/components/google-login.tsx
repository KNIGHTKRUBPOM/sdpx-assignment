"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
export function GoogleLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="button full"
        data-testid="google-login"
        disabled={!configured || busy}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl: "/dashboard" });
        }}
      >
        {busy ? "กำลังเชื่อมต่อ…" : "เข้าสู่ระบบด้วย Google ↗"}
      </button>
      {!configured && (
        <p className="notice" style={{ marginTop: 18 }}>
          ระบบกำลังเตรียมการเชื่อมต่อ Google และฐานข้อมูล
          กรุณาติดต่อผู้ดูแลก่อนเริ่มใช้งาน
        </p>
      )}
    </>
  );
}
