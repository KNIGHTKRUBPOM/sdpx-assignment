"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header, Footer } from "./header";
import { api, dateText, statusLabel, errorValue, ApiError } from "./api";
import { ErrorPopup } from "./error-popup";
import { NotificationPopup } from "./notification-popup";
import { Pending, LinkPending } from "./pending";
import { EvaluationProgress } from "./evaluation-progress";
import { evaluationProgress, type MyProgress } from "../domain/evaluation-progress";
import type { StudentScore } from "../domain/model";
import type { ItemScoreSummary } from "../core/types";
import type { QualitySignalReport } from "../core/quality-signals/quality-signals";
import type { InstructorGuide, SuggestedPair } from "../domain/instructor-guide";

interface Detail {
  assignment: {
    id: string;
    name: string;
    classroomId: string;
    status: string;
    closesAt: string;
    config: { individualMaxScore: number };
  };
  role: string;
  classroomName: string;
  classroomArchived: boolean;
  myProgress: MyProgress;
  instructorGuide?: InstructorGuide;
}
interface Evaluation {
  assignmentId: string;
  side: string;
  status: string;
  closesAt: string;
  criteria: { id: string; name: string }[];
  comparisons: {
    pairAssignmentId: string;
    criterionId: string;
    leftItem: { name: string; url: string };
    rightItem: { name: string; url: string };
    currentChoice: number | null;
    submittedChoice: number | null;
    version: number;
  }[];
}
interface SelfScore {
  label: string;
  groupScore: number;
  individualScore?: number;
  participationRatio: number;
  multiplier: number;
  finalPersonalScore?: number;
  statusMessage?: string;
}
interface Coverage {
  criterionId: string;
  criterionName: string;
  itemAName: string;
  itemBName: string;
  itemAId: string;
  itemBId: string;
  assigned: number;
  submitted: number;
}
const choiceLabels = [
  "ซ้ายดีกว่ามาก",
  "ซ้ายดีกว่า",
  "ซ้ายดีกว่าเล็กน้อย",
  "ขวาดีกว่าเล็กน้อย",
  "ขวาดีกว่า",
  "ขวาดีกว่ามาก",
];
const eventTime = () => Date.now();
export function AssignmentWorkspace({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail>(),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState<Error | string>(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation>(),
    [index, setIndex] = useState(0),
    [selfScore, setSelfScore] = useState<SelfScore>();
  const [students, setStudents] = useState<StudentScore[]>([]),
    [groups, setGroups] = useState<(ItemScoreSummary & { name: string })[]>([]),
    [coverage, setCoverage] = useState<Coverage[]>([]);
  const [quality, setQuality] = useState<QualitySignalReport>();
  const [reason, setReason] = useState(""),
    [acceptReduction, setAcceptReduction] = useState(false),
    [feasibility, setFeasibility] = useState<{
      message: string;
      achievableCoverage: number;
    }>();
  const [startedAt, setStartedAt] = useState(0);
  const [suggestionKey, setSuggestionKey] = useState("");
  const evaluationPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if ((tab === "GROUP" || tab === "INDIVIDUAL") && evaluation?.side === tab) {
      evaluationPanel.current?.scrollIntoView({ block: "start" });
      evaluationPanel.current?.focus({ preventScroll: true });
    }
  }, [tab, evaluation?.side]);
  const updateEvaluation = (value: Evaluation) => {
    setEvaluation(value);
    setDetail((d) => d ? { ...d, myProgress: { ...d.myProgress, [value.side]: evaluationProgress(value.comparisons) } } : d);
  };
  const load = async () => {
    const d = await api<Detail>(`/assignments/${id}`);
    setDetail(d);
    return d;
  };
  useEffect(() => {
    void load().catch((e) => setError(errorValue(e)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async <T,>(task: () => Promise<T>, text: string | ((result: T) => string), refresh = true) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await task();
      if (refresh) await load();
      setMessage(typeof text === "function" ? text(result) : text);
    } catch (e) {
      setError(errorValue(e));
    } finally {
      setBusy(false);
    }
  };
  const selectTab = async (next: string) => {
    if (busy) return;
    setBusy(true);
    setEvaluation(undefined);
    setSelfScore(undefined);
    setTab(next);
    setError("");
    setMessage("");
    setIndex(0);
    setStartedAt(eventTime());
    try {
      if (next === "GROUP" || next === "INDIVIDUAL") {
        const value = await api<Evaluation>(`/assignments/${id}/my-evaluations?side=${next}`);
        updateEvaluation(value);
        setIndex(Math.max(0, value.comparisons.findIndex((p) => p.currentChoice === null || p.currentChoice !== p.submittedChoice)));
      }
      if (next === "score")
        setSelfScore(await api(`/assignments/${id}/my-score`));
      if (next === "reports") {
        const [s, g, c, q] = await Promise.all([
          api<StudentScore[]>(`/assignments/${id}/reports/individual`),
          api<(ItemScoreSummary & { name: string })[]>(
            `/assignments/${id}/reports/group`,
          ),
          api<Coverage[]>(`/assignments/${id}/reports/coverage`),
          api<QualitySignalReport>(`/assignments/${id}/reports/quality`),
        ]);
        setStudents(s);
        setGroups(g);
        setCoverage(c);
        setQuality(q);
      }
    } catch (e) {
      setError(errorValue(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (choice: number) => {
    if (!evaluation) return;
    const previous = evaluation,
      current = evaluation.comparisons[index];
    setEvaluation({
      ...evaluation,
      comparisons: evaluation.comparisons.map((p) =>
        p.pairAssignmentId === current.pairAssignmentId
          ? { ...p, currentChoice: choice }
          : p,
      ),
    });
    await act(async () => {
      try {
        const result = await api<{ version: number }>(
          `/comparisons/${current.pairAssignmentId}`,
          "PUT",
          {
            choice,
            expectedVersion: current.version,
            timeOnTaskMs: Date.now() - startedAt,
          },
        );
        updateEvaluation({
          ...previous,
          comparisons: previous.comparisons.map((p) =>
            p.pairAssignmentId === current.pairAssignmentId
              ? { ...p, currentChoice: choice, version: result.version }
              : p,
          ),
        });
      } catch (error) {
        setEvaluation(previous);
        throw error;
      }
    }, "✓ บันทึกฉบับร่างแล้ว", false);
  };
  const assignAndOpen = (pair: Pick<SuggestedPair, "criterionId" | "itemAId" | "itemBId">) => act(async () => {
    setEvaluation(undefined);
    const result = await api<{ side: string }>(`/assignments/${id}/instructor-pairs`, "POST", pair);
    const value = await api<Evaluation>(`/assignments/${id}/my-evaluations?side=${result.side}`);
    setTab(result.side);
    updateEvaluation(value);
    setSelfScore(undefined);
    setIndex(Math.max(0, value.comparisons.findIndex(p => p.currentChoice === null || p.currentChoice !== p.submittedChoice)));
    setStartedAt(eventTime());
  }, "เพิ่มคู่ให้อาจารย์ประเมินแล้ว");
  const submit = () =>
    act(async () => {
      await api(
        `/assignments/${id}/submissions`,
        "POST",
        { side: tab },
        { "Idempotency-Key": crypto.randomUUID() },
      );
      const value = await api<Evaluation>(`/assignments/${id}/my-evaluations?side=${tab}`);
      updateEvaluation(value);
      return evaluationProgress(value.comparisons);
    }, (p) => `ส่งผลประเมินแล้ว ${p.submitted}/${p.total} คู่${p.outstanding ? ` · ยังขาด ${p.outstanding} คู่ในส่วนนี้` : " · ส่งครบในส่วนนี้แล้ว"} สามารถแก้และส่งใหม่ได้ก่อนหมดเวลา`);
  const download = async (report: string) => {
    await act(async () => {
      const response = await fetch(`/api/assignments/${id}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!response.ok) {
        const e = await response.json();
        throw new ApiError(e.error.message, e.error.code, e.error.requestId);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `paireval_${report}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }, "ดาวน์โหลดรายงานแล้ว");
  };
  const a = detail?.assignment,
    isStaff = detail && ["OWNER", "CO_TEACHER"].includes(detail.role),
    pair = evaluation?.comparisons[index];
  const isOpen = a?.status === "OPEN" && !detail?.classroomArchived;
  const individualDisabled = a?.config.individualMaxScore === 0 && !detail?.myProgress.INDIVIDUAL.total;
  const guide = detail?.instructorGuide;
  const suggested = guide?.suggestions.find(p => p.key === suggestionKey) ?? guide?.suggestions[0];
  return (
    <div className="shell">
      <Header />
      <main className="content">
        {!detail && !error && <Pending text="กำลังโหลดงานประเมิน…" />}
        {busy && <div className="operation-status"><Pending /></div>}
        <div className="pagehead">
          <div>
            <Link
              className="backlink"
              href={a ? `/classrooms/${a.classroomId}` : "/dashboard"}
            >
              ← {detail?.classroomName || "ห้องเรียน"}
              <LinkPending />
            </Link>
            <h1>{a?.name || "กำลังโหลดงานประเมิน…"}</h1>
            <p>{a ? `ปิดรับ ${dateText(a.closesAt)}` : "กรุณารอสักครู่"}</p>
          </div>
          {a && (
            <span className={`badge ${isOpen ? "green" : ""}`}>
              {statusLabel[a.status]}
            </span>
          )}
        </div>
        <div className="tabs" role="tablist" aria-label="เมนูงานประเมิน">
          {[
            ["overview", "ภาพรวม"],
            ...(detail?.role === "STUDENT"
              ? [
                  ["GROUP", "ประเมินกลุ่ม"],
                  ["INDIVIDUAL", "ประเมินเพื่อน"],
                  ["score", "คะแนนของฉัน"],
                ]
              : []),
            ...(isStaff
              ? [
                  ["reports", "รายงานและคะแนน"],
                  ["GROUP", "ประเมินกลุ่ม"],
                  ["INDIVIDUAL", "ประเมินรายบุคคล"],
                ]
              : []),
          ].filter(([key]) => key !== "INDIVIDUAL" || !individualDisabled).map(([key, label]) => (
            <button
              role="tab"
              disabled={busy}
              aria-selected={tab === key}
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => void selectTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorPopup error={error} onDismiss={() => setError("")} />
        {detail?.classroomArchived && <div className="notice" data-testid="archived-notice"><strong>ห้องเรียนนี้เก็บถาวรแล้ว · อ่านอย่างเดียว</strong><p>ดูคำตอบและรายงานเดิมได้ แต่ไม่สามารถบันทึก ส่งประเมิน หรือแก้คะแนนได้</p></div>}
        <NotificationPopup message={message} onDismiss={() => setMessage("")} testId="autosave-status" autoDismiss={message.startsWith("✓ บันทึกฉบับร่างแล้ว")} />
        {isStaff && guide && <section className="card" aria-labelledby="instructor-guide-title" data-testid="instructor-guide">
          <div className="card-top"><h2 id="instructor-guide-title">อาจารย์ต้องทำอะไรต่อ</h2><span className="badge">คะแนนรายบุคคลรอเปิดเผย {guide.needsEvaluators + guide.waitingForSubmissions} คน</span></div>
          <p data-testid="instructor-guide-counts">นักศึกษาที่มีผู้ประเมินไม่ถึง 3 คน: {guide.needsEvaluators} คน · นักศึกษาที่รอคำตอบจากผู้ประเมินเดิม: {guide.waitingForSubmissions} คน</p>
          {isOpen && suggested ? <>
            <p className="muted">อาจารย์ช่วยเป็นผู้ประเมินเพิ่มได้ รับคู่ด้านล่างแล้วตอบและกดส่ง ระบบจะปรับรายการแนะนำให้ใหม่</p>
            <div className="form-row"><label>คู่รายบุคคลที่ช่วยได้<select data-testid="instructor-suggestion" value={suggested.key} disabled={busy} onChange={e => setSuggestionKey(e.target.value)}>{guide.suggestions.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
            <button className="button" data-testid="instructor-start-suggestion" disabled={busy || !!detail.myProgress.INDIVIDUAL.outstanding} onClick={() => void assignAndOpen(suggested)}>รับคู่นี้และไปประเมิน →</button></div>
            {!!detail.myProgress.INDIVIDUAL.outstanding && <p>ทำคู่ที่รับไว้ให้เสร็จและกดส่งก่อนรับคู่ถัดไป ใช้ปุ่มประเมินต่อด้านล่างได้เลย</p>}
          </> : <p>{!isOpen ? "ดูสถานะได้ แต่รับคู่และส่งคำตอบได้เฉพาะช่วงเปิดประเมิน" : guide.needsEvaluators ? "ยังไม่มีคู่ที่อาจารย์ช่วยเพิ่มได้ ตรวจขนาดกลุ่มและการจัดคู่ในรายงาน" : guide.waitingForSubmissions ? "รอผู้ประเมินที่รับคู่ไว้ส่งคำตอบ ไม่จำเป็นต้องเพิ่มคู่ให้อาจารย์" : "ผู้ประเมินครบตามเกณฑ์แล้ว ตรวจรายงานก่อนปิดรับและยืนยันคะแนน"}</p>}
          <div className="row"><button className="button secondary small" data-testid="instructor-open-reports" disabled={busy} onClick={() => void selectTab("reports")}>ดูรายงานและตรวจความครบถ้วน</button>
          <button className="button secondary small" data-testid="instructor-refresh-guide" disabled={busy} onClick={() => void act(load, "อัปเดตสถานะแล้ว", false)}>อัปเดตสถานะ ↻</button></div>
        </section>}
        {detail?.myProgress && (detail.role === "STUDENT" || isStaff) && <EvaluationProgress progress={detail.myProgress} individualDisabled={individualDisabled} instructor={!!isStaff} onOpen={busy ? undefined : (side) => void selectTab(side)} readOnly={!isOpen} />}
        {tab === "overview" && (
          <div className="two-col">
            <section className="card">
              <span className="eyebrow">BEFORE YOU BEGIN</span>
              <h2>ประเมินจากสิ่งที่เห็น</h2>
              <p>
                เปิดผลงานทั้งสองฝั่ง แล้วเลือกความแตกต่างตามเกณฑ์ที่แสดง
                ไม่มีตัวเลือกเสมอ
                และระบบจะไม่ให้คุณประเมินตัวเองหรือกลุ่มของตัวเอง
              </p>
              <hr />
              <h3>คะแนนกับการเข้าร่วมเป็นคนละส่วน</h3>
              <p>
                คะแนนผลงานเริ่มจากฐาน 60% แล้วเพิ่มตามผลเปรียบเทียบ
                หากส่งประเมินไม่ถึง 90% ของคู่ที่ได้รับ
                คะแนนรวมส่วนตัวจะถูกคูณด้วยสัดส่วนการเข้าร่วม
              </p>
              <h3>ฉบับร่างยังไม่ใช่คำตอบที่ส่งแล้ว</h3>
              <p>
                ระบบบันทึกเมื่อเลือกคำตอบ แต่ต้องกดส่งผลการประเมินของแต่ละส่วน
                คะแนนจึงจะนำไปคำนวณได้ แก้ไขและส่งใหม่ได้ก่อนหมดเวลา
              </p>
              {!individualDisabled && <div className="notice">
                คะแนนรายบุคคลจะเปิดเผยเมื่อมีผู้ประเมินอย่างน้อย 3 คน
                กลุ่มเล็กอาจยังมีข้อมูลไม่พอ ส่วนกลุ่ม 2
                คนไม่สามารถประเมินรายบุคคลได้
              </div>}
            </section>
            <section className="card">
              <h3>{isStaff ? "จัดการงานประเมิน" : "สถานะงาน"}</h3>
              {isStaff && !detail?.classroomArchived && a?.status === "DRAFT" ? (
                <div className="stack">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        async () => {
                          const result = await api<{ message: string; achievableCoverage: number }>(`/assignments/${id}/feasibility`);
                          setFeasibility(result);
                          return result;
                        },
                        (result) => result.message,
                      )
                    }
                  >
                    ตรวจสอบจำนวนคู่และภาระงาน
                  </button>
                  {feasibility && (
                    <p className="muted">Coverage สูงสุดที่จัดคู่ได้: {feasibility.achievableCoverage} คนต่อคู่</p>
                  )}
                  <label className="row">
                    <input
                      style={{ width: 18, height: 18 }}
                      type="checkbox"
                      checked={acceptReduction}
                      onChange={(e) => setAcceptReduction(e.target.checked)}
                    />
                    ยอมรับ coverage ที่ลดลงตามข้อจำกัดห้อง
                  </label>
                  <button
                    className="button"
                    disabled={busy || !feasibility}
                    onClick={() =>
                      void act(
                        () =>
                          api(`/assignments/${id}/publish`, "POST", {
                            acceptReducedCoverage: acceptReduction,
                          }),
                        "เปิดงานและสร้างคู่ประเมินแล้ว",
                      )
                    }
                  >
                    Publish งานประเมิน
                  </button>
                </div>
              ) : (
                <p>{a ? statusLabel[a.status] : ""}</p>
              )}
              {isStaff && !detail?.classroomArchived &&
                a &&
                ["OPEN", "PUBLISHED", "CLOSED"].includes(a.status) && (
                  <div className="stack">
                    <label>
                      เหตุผลในการดำเนินการ
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="เช่น ตรวจสอบข้อมูลครบแล้ว ยืนยันคะแนนสำหรับส่งงาน"
                      />
                    </label>
                    {["OPEN", "PUBLISHED"].includes(a.status) && (
                      <button
                        className="button secondary"
                        disabled={busy || reason.trim().length < 3}
                        onClick={() =>
                          void act(
                            () =>
                              api(`/assignments/${id}/close`, "POST", {
                                reason,
                              }),
                            "ปิดรับประเมินแล้ว",
                          )
                        }
                      >
                        ปิดรับประเมิน
                      </button>
                    )}
                    {detail?.role === "OWNER" && a.status === "CLOSED" && (
                      <>
                        <p className="muted">
                          ตรวจรายงานและ LOW_CONFIDENCE ก่อนยืนยัน คะแนนจะถูก
                          snapshot และคำตอบจะล็อก
                        </p>
                        <button
                          className="button"
                          disabled={busy || reason.trim().length < 3}
                          onClick={() =>
                            void act(
                              () =>
                                api(`/assignments/${id}/finalize`, "POST", {
                                  reason,
                                }),
                              "ยืนยันคะแนนและบันทึก snapshot แล้ว",
                            )
                          }
                        >
                          Finalize คะแนน
                        </button>
                      </>
                    )}
                  </div>
                )}
              {detail?.role === "STUDENT" && (
                <button
                  className="button"
                  disabled={a?.status === "DRAFT"}
                  onClick={() => void selectTab("GROUP")}
                >
                  ไปหน้าประเมิน →
                </button>
              )}
            </section>
          </div>
        )}
        {(tab === "GROUP" || tab === "INDIVIDUAL") &&
          evaluation?.side === tab && (
            <div ref={evaluationPanel} tabIndex={-1} data-testid="evaluation-panel" style={{ maxWidth: 720, margin: "auto" }}>
              {evaluation.comparisons.length === 0 ? (
                <div className="card empty">
                  <h2>ไม่มีคู่ที่ต้องประเมินในส่วนนี้</h2>
                  <p>
                    กลุ่มขนาด 2 คนไม่รองรับการประเมินรายบุคคล
                    หรืออาจารย์ยังไม่ได้จัดคู่ให้คุณ
                  </p>
                </div>
              ) : (
                pair && (
                  <>
                    <div className="card" data-testid="evaluation-card">
                      <div className="card-top">
                        <div>
                          <span className="eyebrow">
                            {tab === "GROUP"
                              ? "GROUP EVALUATION"
                              : "INDIVIDUAL EVALUATION"}
                          </span>
                          <h2>
                            {
                              evaluation.criteria.find(
                                (c) => c.id === pair.criterionId,
                              )?.name
                            }
                          </h2>
                        </div>
                        <span
                          className="badge"
                          data-testid="progress-indicator"
                        >
                          {index + 1} / {evaluation.comparisons.length}
                        </span>
                      </div>
                      <p className="muted" data-testid="current-pair-status">คู่นี้: {pair.currentChoice === null ? "ยังไม่ได้ประเมิน" : pair.currentChoice === pair.submittedChoice ? "ส่งแล้ว" : pair.submittedChoice === null ? "บันทึกแล้ว ยังไม่ได้ส่ง" : "แก้ไขแล้ว ต้องส่งใหม่"}</p>
                      <div className="compare">
                        <div className="item">
                          <strong data-testid="left-item-name">
                            {pair.leftItem?.name}
                          </strong>
                          {pair.leftItem?.url && (
                            <a
                              href={pair.leftItem.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              ดูผลงาน ↗
                            </a>
                          )}
                        </div>
                        <span className="muted">vs</span>
                        <div className="item">
                          <strong data-testid="right-item-name">
                            {pair.rightItem?.name}
                          </strong>
                          {pair.rightItem?.url && (
                            <a
                              href={pair.rightItem.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              ดูผลงาน ↗
                            </a>
                          )}
                        </div>
                      </div>
                      <fieldset
                        disabled={busy || !isOpen}
                        style={{ border: 0, padding: 0, margin: 0 }}
                      >
                        <legend className="muted" style={{ marginBottom: 12 }}>
                          เลือกความแตกต่างของผลงานตามเกณฑ์
                        </legend>
                        <div
                          className="scale"
                          role="radiogroup"
                          aria-label="ระดับความแตกต่าง"
                          data-testid="choice-radio-group"
                        >
                          {choiceLabels.map((label, i) => (
                            <label key={i}>
                              <input
                                type="radio"
                                name="choice"
                                value={i + 1}
                                aria-label={`${i + 1} ${label}`}
                                checked={pair.currentChoice === i + 1}
                                onChange={() => void save(i + 1)}
                                data-testid={`choice-${i + 1}`}
                              />
                              <span>{i + 1}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="scale-hints">
                        <span>← ซ้ายดีกว่ามาก</span>
                        <span>ขวาดีกว่ามาก →</span>
                      </div>
                      <p className="muted" style={{ marginTop: 18 }}>
                        {pair.currentChoice
                          ? `${pair.currentChoice} · ${choiceLabels[pair.currentChoice - 1]}`
                          : "เลือก 1–6 เพื่อบันทึกคำตอบ"}
                      </p>
                      <div
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          marginTop: 24,
                        }}
                      >
                        <button
                          className="button secondary"
                          disabled={index === 0 || busy}
                          onClick={() => {
                            setIndex(index - 1);
                            setStartedAt(eventTime());
                            setMessage("");
                          }}
                        >
                          ← ก่อนหน้า
                        </button>
                        <button
                          className="button secondary"
                          disabled={
                            index === evaluation.comparisons.length - 1 || busy
                          }
                          onClick={() => {
                            setIndex(index + 1);
                            setStartedAt(eventTime());
                            setMessage("");
                          }}
                        >
                          คู่ถัดไป →
                        </button>
                      </div>
                    </div>
                    {!isOpen && (
                      <div className="notice">
                        งานนี้ยังไม่เปิดหรือปิดรับแล้ว
                        แสดงคำตอบแบบอ่านอย่างเดียว
                      </div>
                    )}
                    <button
                      className="button full"
                      disabled={busy || !isOpen}
                      onClick={() => void submit()}
                      data-testid="submit-evaluations-btn"
                    >
                      ส่งผลการประเมินส่วน
                      {tab === "GROUP" ? "กลุ่ม" : "รายบุคคล"} (
                      {
                        evaluation.comparisons.filter(
                          (p) => p.currentChoice !== null,
                        ).length
                      }{" "}
                      คู่)
                    </button>
                  </>
                )
              )}
            </div>
          )}
        {tab === "score" && selfScore && (
          <>
            <div className="notice">
              {selfScore.label}
              {selfScore.statusMessage && (
                <p style={{ marginBottom: 0 }}>{selfScore.statusMessage}</p>
              )}
            </div>
            <div className="grid">
              {[
                ["คะแนนกลุ่ม", selfScore.groupScore.toFixed(2)],
                [
                  "คะแนนรายบุคคล",
                  selfScore.individualScore?.toFixed(2) ?? "ยังไม่เปิดเผย",
                ],
                [
                  "คะแนนรวม",
                  selfScore.finalPersonalScore?.toFixed(2) ?? "ยังไม่เปิดเผย",
                ],
              ].map(([name, value]) => (
                <div className="card" key={name}>
                  <p>{name}</p>
                  <span className="stat">{value}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <h3>การเข้าร่วมของคุณ</h3>
              <p>
                ส่งแล้ว {(selfScore.participationRatio * 100).toFixed(0)}% ·
                ตัวคูณคะแนน {selfScore.multiplier.toFixed(3)}
              </p>
            </div>
          </>
        )}
        {tab === "reports" && isStaff && (
          <>
            <div className="row" style={{ marginBottom: 20 }}>
              <button
                className="button"
                disabled={busy}
                onClick={() => void download("individual")}
              >
                ดาวน์โหลดคะแนน CSV ↓
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void download("raw")}
              >
                CSV ผลเปรียบเทียบ (ปกปิดผู้ประเมิน)
              </button>
              <button
                className="button secondary"
                onClick={() => void selectTab("reports")}
              >
                คำนวณ / โหลดใหม่ ↻
              </button>
            </div>
            {quality && (
              <div className="notice">
                <strong>คุณภาพการประเมิน · สัญญาณเพื่อทบทวน</strong>
                <p style={{ marginBottom: 0 }}>
                  ข้อมูลกลุ่มยังน้อย {quality.lowCoverageItems.length} รายการ ·
                  เลือกคำตอบซ้ำ {quality.straightLiningEvaluators.length} คน ·
                  เอนเอียงฝั่งเดียว {quality.positionBiasEvaluators.length} คน ·
                  ใช้เวลาน้อยผิดปกติ {quality.speedRunEvaluators.length} คน
                </p>
                <span className="muted">
                  ระบบไม่ลดคะแนนจากสัญญาณเหล่านี้โดยอัตโนมัติ
                </span>
              </div>
            )}
            <h2>คะแนนรายบุคคล</h2>
            <p className="muted">
              {a?.status === "FINALIZED"
                ? "คะแนนที่ยืนยันแล้ว"
                : "ชั่วคราว — อาจเปลี่ยนแปลงได้"}
            </p>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>นักศึกษา</th>
                    <th>กลุ่ม</th>
                    <th>รายบุคคล</th>
                    <th>เข้าร่วม</th>
                    <th>รวม</th>
                    <th>ตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.studentId}>
                      <td>{s.name}</td>
                      <td>{s.group.totalComponentScore.toFixed(2)}</td>
                      <td>{s.individual.totalComponentScore.toFixed(2)}</td>
                      <td>
                        {(s.personal.participationRatio * 100).toFixed(0)}%
                      </td>
                      <td>
                        <strong>
                          {s.personal.finalPersonalScore.toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        {[...s.group.flags, ...s.individual.flags].includes(
                          "LOW_CONFIDENCE",
                        )
                          ? "ข้อมูลยังน้อย"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="two-col">
              <section>
                <h2>คะแนนกลุ่ม</h2>
                {groups.map((g) => (
                  <div className="card" key={g.itemId}>
                    <strong>{g.name}</strong>
                    <div className="stat">
                      {g.totalComponentScore.toFixed(2)}
                    </div>
                    <p>{g.flags.join(", ") || "ข้อมูลเพียงพอ"}</p>
                  </div>
                ))}
              </section>
              <section>
                <h2>ความครอบคลุมของคู่</h2>
                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>เกณฑ์</th>
                        <th>คู่</th>
                        <th>ส่ง / มอบหมาย</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverage.map((c, i) => (
                        <tr key={i}>
                          <td>{c.criterionName}</td>
                          <td>
                            {c.itemAName} / {c.itemBName}
                          </td>
                          <td>
                            {c.submitted} / {c.assigned}{" "}
                            {isOpen && (
                              <button
                                className="button secondary small"
                                disabled={busy}
                                onClick={() => void assignAndOpen({ criterionId: c.criterionId, itemAId: c.itemAId, itemBId: c.itemBId })}
                              >
                                ประเมินเอง
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            {detail.role === "OWNER" && !detail.classroomArchived && a?.status === "FINALIZED" && (
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    () =>
                      api(`/assignments/${id}/overrides`, "POST", {
                        studentId: f.get("studentId"),
                        value: Number(f.get("value")),
                        reason: f.get("reason"),
                      }),
                    "บันทึก override แล้ว คะแนนต้นฉบับยังอยู่ใน snapshot",
                  );
                }}
              >
                <h3>ปรับคะแนนพร้อมเหตุผล</h3>
                <div className="form-row">
                  <label>
                    นักศึกษา
                    <select name="studentId">
                      {students.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    คะแนนรวมใหม่
                    <input
                      name="value"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                    />
                  </label>
                </div>
                <label>
                  เหตุผล
                  <textarea name="reason" minLength={3} required />
                </label>
                <button className="button secondary" disabled={busy}>
                  บันทึกการปรับคะแนน
                </button>
              </form>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
