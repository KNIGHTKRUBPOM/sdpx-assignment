"use client";
import { useEffect, useRef } from "react";

export function NotificationPopup({ message, onDismiss, testId = "notification-popup", autoDismiss = false }: {
  message: string; onDismiss: () => void; testId?: string; autoDismiss?: boolean;
}) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!message || !autoDismiss) return;
    const timer = window.setTimeout(() => dismiss.current(), 4000);
    return () => window.clearTimeout(timer);
  }, [message, autoDismiss]);
  return <div className={message ? "notification-popup" : undefined} role="status" aria-live="polite" aria-atomic="true" data-testid={testId}>
    {message && <>
      <span className="notification-symbol" aria-hidden="true">✓</span>
      <div><strong>แจ้งผลการดำเนินการ</strong><p>{message}</p></div>
      <button type="button" className="notification-close" aria-label="ปิดการแจ้งเตือน" data-testid="notification-dismiss" onClick={onDismiss}>×</button>
    </>}
  </div>;
}
