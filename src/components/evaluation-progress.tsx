import { progressLabel, type MyProgress } from "../domain/evaluation-progress";

export function EvaluationProgress({ progress, compact = false, onOpen, readOnly = false, instructor = false, individualDisabled = false }: { progress: MyProgress; compact?: boolean; onOpen?: (side: string) => void; readOnly?: boolean; instructor?: boolean; individualDisabled?: boolean }) {
  return <div className={compact ? "evaluation-progress compact" : "evaluation-progress"} role="group" aria-label="ความคืบหน้าการประเมินของฉัน" data-testid="my-evaluation-progress">
    {(["GROUP", "INDIVIDUAL"] as const).map((side) => {
      const p = progress[side];
      return <section key={side} className="progress-section" data-testid={`my-progress-${side}`}>
        <div className="card-top"><strong>{side === "GROUP" ? "ประเมินกลุ่ม" : instructor ? "อาจารย์ประเมินรายบุคคล" : "ประเมินเพื่อน"}</strong><span className={`badge ${p.total && !p.outstanding ? "green" : ""}`}>{side === "INDIVIDUAL" && individualDisabled && !p.total ? "ปิดการประเมินรายบุคคล" : progressLabel(p)}</span></div>
        {!!p.total && <>
          <p>ส่งคำตอบล่าสุดแล้ว {p.total - p.outstanding}/{p.total} คู่ · เหลือประเมิน {p.remaining} คู่</p>
          <p className="muted">ยังขาดส่งคำตอบล่าสุด {p.outstanding} คู่{!compact && ` · บันทึกแล้วรอส่ง ${p.pending} คู่`}</p>
          {!!p.changed && <p className="muted">แก้ไขหลังส่ง {p.changed} คู่ ต้องกดส่งอีกครั้ง</p>}
          {!compact && <div className="progress-track" role="progressbar" aria-label={`${side === "GROUP" ? "งานกลุ่ม" : "รายบุคคล"}ที่ส่งตรงกับคำตอบล่าสุด`} aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.total - p.outstanding}><div style={{ width: `${(p.total - p.outstanding) / p.total * 100}%` }} /></div>}
          {onOpen && <button className="button secondary small" onClick={() => onOpen(side)}>{readOnly ? "ดูคำตอบ" : p.remaining ? "ประเมินต่อ" : p.outstanding ? "ตรวจและส่งผล" : "ดูคำตอบที่ส่งแล้ว"}</button>}
        </>}
      </section>;
    })}
  </div>;
}
