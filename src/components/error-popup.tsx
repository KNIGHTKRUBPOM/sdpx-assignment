"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "./api";

export function ErrorPopup({ error, onDismiss }: { error: Error | string; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), descriptionId = useId();
  const lastFocus = useRef<HTMLElement | null>(null);
  const message = error instanceof Error ? error.message : error;
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body && !ref.current?.contains(event.target)) lastFocus.current = event.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  useEffect(() => {
    if (!message) return;
    const previous = lastFocus.current ?? document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector("button")?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [message]);
  return <dialog ref={ref} className="error-dialog" role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} data-testid="error-popup"
    onCancel={(e) => { e.preventDefault(); onDismiss(); }}>
    <div className="dialog-symbol" aria-hidden="true">!</div>
    <h2 id={titleId}>ทำรายการไม่สำเร็จ</h2>
    <p id={descriptionId}>{message}</p>
    {error instanceof ApiError && (error.requestId || error.code) && <details className="muted">
      <summary>ข้อมูลสำหรับติดต่อผู้ดูแล</summary>
      <p>รหัส: {error.code ?? "—"}<br />อ้างอิง: {error.requestId ?? "—"}</p>
    </details>}
    <button type="button" className="button full" data-testid="error-dismiss" onClick={onDismiss}>รับทราบ กลับไปตรวจสอบ</button>
  </dialog>;
}

export function InitialErrorPopup({ message }: { message: string }) {
  const [error, setError] = useState(message);
  return <ErrorPopup error={error} onDismiss={() => setError("")} />;
}
