"use client";
import { useEffect, useId, useRef, useState } from "react";

export function ArchiveDialog({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId(), descriptionId = useId();
  const [confirmation, setConfirmation] = useState(""), [reason, setReason] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    ref.current?.querySelector<HTMLButtonElement>("[data-testid='archive-cancel']")?.focus();
    const dialog = ref.current;
    return () => { dialog?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="error-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} data-testid="archive-dialog" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>เก็บห้องเรียนถาวร?</h2>
    <p id={descriptionId}>ห้อง “{name}” จะหายจากรายการหลักและเปลี่ยนเป็นอ่านอย่างเดียว ทุกงานในห้องจะหยุดรับคำตอบ รวมถึงงานที่กำลังเปิดประเมิน คะแนนและประวัติยังอยู่ โดยไม่สามารถเปิดห้องกลับจากหน้านี้ได้</p>
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (confirmation === name && reason.trim().length >= 3) onConfirm(reason.trim()); }}>
      <label>พิมพ์ชื่อห้องเรียนเพื่อยืนยัน<input data-testid="archive-name" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" required /></label>
      <label>เหตุผลในการเก็บห้อง<textarea data-testid="archive-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={1000} required /></label>
      <button type="button" className="button secondary" data-testid="archive-cancel" onClick={onCancel}>ยกเลิก กลับไปห้องเรียน</button>
      <button className="button" data-testid="archive-confirm" disabled={confirmation !== name || reason.trim().length < 3}>ยืนยันเก็บห้องถาวร</button>
    </form>
  </dialog>;
}
