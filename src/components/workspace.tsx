"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Header, Footer } from "./header";
import { api, dateText, statusLabel, errorValue } from "./api";
import { ErrorPopup } from "./error-popup";
import { ArchiveDialog } from "./archive-dialog";
import { NotificationPopup } from "./notification-popup";
import { Pending, LinkPending } from "./pending";
import { EvaluationProgress } from "./evaluation-progress";
import type { MyProgress } from "../domain/evaluation-progress";

interface Room {
  classroom: { id: string; name: string; slug: string; domains: string[]; archivedAt: string | null };
  role: string;
}
interface Work {
  id: string;
  classroomId: string;
  name: string;
  status: string;
  closesAt: string;
  myProgress: MyProgress;
  config: { individualMaxScore: number };
}
interface Dashboard {
  user: { name: string; email: string };
  noticeAccepted: boolean;
  canCreateClassroom: boolean;
  classrooms: Room[];
  archivedClassrooms: Room[];
  assignments: Work[];
}
interface Roster {
  members: {
    id: string;
    name: string;
    email: string;
    role: string;
    groupId: string | null;
  }[];
  groups: { id: string; name: string; artifactUrl: string }[];
}
export function Workspace({ classroomId }: { classroomId?: string }) {
  const [data, setData] = useState<Dashboard>(),
    [roster, setRoster] = useState<Roster>(),
    [error, setError] = useState<Error | string>(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [archiving, setArchiving] = useState(false);
  const load = async () => {
    const dashboard = await api<Dashboard>("/dashboard");
    setData(dashboard);
    if (classroomId) {
      const room = [...dashboard.classrooms, ...dashboard.archivedClassrooms].find(
        (r) => r.classroom.id === classroomId,
      );
      if (room?.role !== "STUDENT")
        setRoster(await api<Roster>(`/classrooms/${classroomId}/roster`));
    }
  };
  useEffect(() => {
    void load().catch((e) => setError(errorValue(e)));
  }, [classroomId]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (task: () => Promise<unknown>, success: string, rosterOnly = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      if (rosterOnly && classroomId) setRoster(await api<Roster>(`/classrooms/${classroomId}/roster`));
      else await load();
      setMessage(success);
    } catch (e) {
      setError(errorValue(e));
    } finally {
      setBusy(false);
    }
  };
  const room = data && [...data.classrooms, ...data.archivedClassrooms].find((r) => r.classroom.id === classroomId);
  const archived = !!room?.classroom.archivedAt;
  const visibleMembers = roster?.members.filter((m) =>
    (!groupFilter || m.groupId === groupFilter) &&
    `${m.name} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  ) ?? [];
  const work =
    data?.assignments.filter(
      (a) => classroomId ? a.classroomId === classroomId : data.classrooms.some((r) => r.classroom.id === a.classroomId),
    ) ?? [];
  const pendingWork = work.filter((a) => a.status === "OPEN").flatMap((a) => Object.values(a.myProgress ?? {})).reduce((sum, p) => ({ total: sum.total + p.total, remaining: sum.remaining + p.remaining, outstanding: sum.outstanding + p.outstanding }), { total: 0, remaining: 0, outstanding: 0 });
  const createRoom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(
      () =>
        api("/classrooms", "POST", {
          name: f.get("name"),
          slug: f.get("slug"),
          domains: String(f.get("domains"))
            .split(",")
            .map((s) => s.trim()),
        }),
      "สร้างห้องเรียนแล้ว",
    );
  };
  return (
    <div className="shell">
      <Header />
      <main className="content">
        {(!data && !error) && <Pending text="กำลังโหลดห้องเรียน…" />}
        {busy && <div className="operation-status"><Pending /></div>}
        <div className="pagehead">
          <div>
            <span className="eyebrow">พื้นที่การเรียนรู้ของคุณ</span>
            {classroomId && (
              <Link href="/dashboard" className="backlink">
                ← ห้องเรียนทั้งหมด
                <LinkPending />
              </Link>
            )}
            <h1>{room?.classroom.name || "ห้องเรียนของฉัน"}</h1>
            <p>
              {data
                ? `สวัสดี ${data.user.name} · ${room ? room.role : "เลือกห้องเรียนเพื่อเริ่มประเมิน"}`
                : "กำลังโหลดห้องเรียน…"}
            </p>
          </div>
          <button
            className="button secondary small"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            ออกจากระบบ
          </button>
        </div>
        {data && <section className="workspace-summary" aria-label="สรุปพื้นที่การเรียนรู้" data-testid="workspace-summary">
          <div className="summary-item"><span>{classroomId ? "สมาชิกในห้อง" : "ห้องเรียนของฉัน"}</span><strong>{classroomId ? (roster ? roster.members.length : "—") : data.classrooms.length}</strong></div>
          <div className="summary-item"><span>งานที่เปิดประเมิน</span><strong>{work.filter((a) => a.status === "OPEN").length}</strong></div>
          <div className="summary-item"><span>{classroomId ? "กลุ่มในห้อง" : "งานประเมินทั้งหมด"}</span><strong>{classroomId ? (roster ? roster.groups.length : "—") : work.length}</strong></div>
        </section>}
        <ErrorPopup error={error} onDismiss={() => setError("")} />
        {archived && <div className="notice" data-testid="archived-notice"><strong>ห้องเรียนนี้เก็บถาวรแล้ว · อ่านอย่างเดียว</strong><p>ดูงานและคะแนนเดิมได้ แต่ไม่สามารถแก้ไขหรือส่งประเมินเพิ่มได้</p></div>}
        {archiving && room && <ArchiveDialog name={room.classroom.name} onCancel={() => setArchiving(false)} onConfirm={(reason) => {
          setArchiving(false);
          void act(() => api(`/classrooms/${classroomId}/archive`, "POST", { name: room.classroom.name, reason }), "เก็บห้องเรียนถาวรแล้ว ข้อมูลเดิมยังอยู่");
        }} />}
        <NotificationPopup message={message} onDismiss={() => setMessage("")} />
        {data && !data.noticeAccepted && (
          <div className="notice">
            <strong>ก่อนเริ่มใช้งานครั้งแรก</strong>
            <p>
              โปรดอ่าน{" "}
              <Link href="/privacy" style={{ textDecoration: "underline" }}>
                ประกาศความเป็นส่วนตัว
              </Link>{" "}
              เพื่อทราบข้อมูลที่เก็บ ผู้ที่เข้าถึง และระยะเวลาเก็บรักษา
            </p>
            <button
              className="button small"
              disabled={busy}
              onClick={() =>
                void act(
                  () => api("/privacy", "POST", {}),
                  "บันทึกการรับทราบแล้ว",
                )
              }
            >
              อ่านและรับทราบแล้ว
            </button>
          </div>
        )}
        {!classroomId && (
          <>
            <div className="grid">
              {data?.classrooms.map((r) => (
                <Link
                  className="card card-link"
                  key={r.classroom.id}
                  href={`/classrooms/${r.classroom.id}`}
                >
                  <div className="card-top">
                    <span className="badge green">{r.role}</span>
                    <span>↗</span>
                  </div>
                  <h2>{r.classroom.name}</h2>
                  <LinkPending />
                  <p>
                    {
                      data.assignments.filter(
                        (a) => a.classroomId === r.classroom.id,
                      ).length
                    }{" "}
                    งานประเมิน
                  </p>
                  <span className="muted">{r.classroom.slug}</span>
                </Link>
              ))}
            </div>
            {data && data.classrooms.length === 0 && (
              <div className="card empty">
                <h3>ยังไม่มีห้องเรียน</h3>
                <p>ให้อาจารย์เพิ่มอีเมล {data.user.email} ในรายชื่อห้องเรียน</p>
              </div>
            )}
            {data?.canCreateClassroom && (
              <details className="card">
                <summary>＋ สร้างห้องเรียน</summary>
                <form className="stack" onSubmit={createRoom}>
                  <div className="form-row">
                    <label>
                      ชื่อห้องเรียน
                      <input
                        name="name"
                        required
                        data-testid="classroom-name"
                        placeholder="Software Development Process"
                      />
                    </label>
                    <label>
                      รหัสห้อง (a–z, 0–9, -)
                      <input
                        name="slug"
                        required
                        pattern="[a-z0-9-]+"
                        placeholder="sdpx-2026"
                      />
                    </label>
                  </div>
                  <label>
                    Domain อีเมลที่อนุญาต (คั่นด้วย comma)
                    <input
                      name="domains"
                      required
                      defaultValue={data.user.email.split("@")[1]}
                      placeholder="gmail.com, university.ac.th"
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    สร้างห้องเรียน
                  </button>
                </form>
              </details>
            )}
            {!!data?.archivedClassrooms.length && <details className="card" data-testid="archived-classrooms"><summary>ห้องเรียนที่เก็บถาวร ({data.archivedClassrooms.length})</summary>
              <div className="stack">{data.archivedClassrooms.map((r) => <Link key={r.classroom.id} data-testid={`archived-room-${r.classroom.id}`} href={`/classrooms/${r.classroom.id}`} className="backlink">{r.classroom.name} · อ่านอย่างเดียว <LinkPending /></Link>)}</div>
            </details>}
          </>
        )}
        <h2 className="section-title">
          งานประเมิน <span className="muted">/ {work.length} งาน</span>
        </h2>
        {!archived && pendingWork.total > 0 && <div className="card" data-testid="pending-evaluation-summary"><strong>งานที่เปิดรับ · เหลือประเมิน {pendingWork.remaining} คู่ · ยังขาดส่งคำตอบล่าสุด {pendingWork.outstanding} คู่</strong><p>รวม {pendingWork.total} คู่ ทุกเกณฑ์ · บันทึกคำตอบแล้วต้องกดส่งผลประเมินด้วย</p></div>}
        <div className="grid">
          {work.map((a) => (
            <Link
              key={a.id}
              className="card card-link"
              href={`/assignments/${a.id}`}
            >
              <div className="card-top">
                <span className={`badge ${a.status === "OPEN" ? "green" : ""}`}>
                  {statusLabel[a.status]}
                </span>
                <span>↗</span>
              </div>
              <h3>{a.name}</h3>
              {a.myProgress && (a.myProgress.GROUP.total + a.myProgress.INDIVIDUAL.total > 0) && <EvaluationProgress progress={a.myProgress} individualDisabled={a.config.individualMaxScore === 0} compact />}
              <LinkPending />
              <p className="muted">ปิดรับ {dateText(a.closesAt)}</p>
              <span className="muted">เปิดงานประเมิน →</span>
            </Link>
          ))}
        </div>
        {data && work.length === 0 && (
          <div className="card empty">
            <h3>ยังไม่มีงานประเมิน</h3>
            <p>งานที่อาจารย์สร้างจะแสดงที่นี่</p>
          </div>
        )}
        {classroomId && room && !archived && ["OWNER", "CO_TEACHER"].includes(room.role) && (
          <details className="card">
            <summary>＋ สร้างงานประเมิน</summary>
            <AssignmentForm
              classroomId={classroomId}
              busy={busy}
              onSave={(body) =>
                act(
                  () => api("/assignments", "POST", body),
                  "สร้างงานประเมินแล้ว",
                )
              }
            />
          </details>
        )}
        {classroomId && roster && (
          <div className="two-col">
            <section>
              <h2 className="section-title">รายชื่อและกลุ่ม</h2>
              <div className="card form-row">
                <label>ค้นหาชื่อหรืออีเมล<input type="search" data-testid="roster-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="เช่น 67015105" /></label>
                <label>แสดงกลุ่ม<select data-testid="group-filter" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                  <option value="">ทุกกลุ่ม ({roster.members.length} คน)</option>
                  {roster.groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({roster.members.filter((m) => m.groupId === g.id).length} คน)</option>)}
                </select></label>
              </div>
              <div className="card table-wrap" tabIndex={0} role="region" aria-label="รายชื่อสมาชิกห้องเรียน">
                <table data-testid="roster-table">
                  <thead>
                    <tr>
                      <th>ชื่อ</th>
                      <th>อีเมล</th>
                      <th>กลุ่ม / สิทธิ์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMembers.length === 0 && <tr><td colSpan={3}>ไม่พบรายชื่อที่ตรงกับการค้นหา</td></tr>}
                    {visibleMembers.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.email}</td>
                        <td>
                          {roster.groups.find((g) => g.id === m.groupId)
                            ?.name || m.role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {roster.groups.filter((g) => !groupFilter || g.id === groupFilter).map((g) => (
                <details className="card" key={g.id}>
                  <summary>{g.name} · {g.artifactUrl ? "มีลิงก์ผลงานแล้ว" : "ยังไม่มีลิงก์ผลงาน"}</summary>
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(
                      () =>
                        api(
                          `/classrooms/${classroomId}/groups/${g.id}`,
                          "PATCH",
                          { artifactUrl: f.get("url") },
                        ),
                      `บันทึกลิงก์ ${g.name} แล้ว`,
                      true,
                    );
                  }}
                >
                  <strong>{g.name}</strong>
                  <label>
                    ลิงก์ผลงาน
                    <input
                      name="url"
                      data-testid={`artifact-url-${g.id}`}
                      disabled={busy || archived}
                      type="url"
                      defaultValue={g.artifactUrl}
                      required
                      placeholder="https://…"
                    />
                  </label>
                  <button className="button secondary small" disabled={busy || archived}>
                    {busy ? "กำลังบันทึก…" : "บันทึกลิงก์"}
                  </button>
                  {g.artifactUrl && <a href={g.artifactUrl} target="_blank" rel="noopener noreferrer">เปิดผลงานที่บันทึกไว้ ↗</a>}
                </form>
                </details>
              ))}
            </section>
            <section>
              <h2 className="section-title">จัดการห้องเรียน</h2>
              {room?.role === "OWNER" && !archived && <div className="card stack">
                <h3>เก็บห้องเรียนที่ไม่ใช้แล้ว</h3><p>นำออกจากรายการหลักและหยุดการแก้ไขทุกงาน โดยยังเก็บคะแนนและประวัติไว้</p>
                <button className="button secondary" data-testid="archive-classroom" disabled={busy} onClick={() => setArchiving(true)}>เก็บห้องเรียนถาวร</button>
              </div>}
              <div className="card stack">
                <h3>นำเข้ารายชื่อ CSV</h3>
                <p>
                  คอลัมน์ที่ใช้: email, group_name, display_name
                  <br />
                  กลุ่มละ 2–8 คน แนะนำ 4–6 คน
                </p>
                <label>
                  เลือกไฟล์ CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy || archived}
                    data-testid="roster-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void act(
                          async () =>
                            api(
                              `/classrooms/${classroomId}/roster/import`,
                              "POST",
                              await file.text(),
                              { "Content-Type": "text/csv" },
                            ),
                          "นำเข้ารายชื่อแล้ว",
                        );
                      e.target.value = "";
                    }}
                  />
                </label>
                <a
                  href="/example-roster.csv"
                  className="muted"
                  download
                  style={{ textDecoration: "underline" }}
                >
                  ดาวน์โหลดตัวอย่าง CSV
                </a>
                <p className="muted">
                  หลัง publish ระบบจะล็อกรายชื่อและผลงาน
                  เพื่อรักษาความถูกต้องของคู่ประเมิน
                </p>
              </div>
              {room?.role === "OWNER" && !archived && (
                <form
                  className="card stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(
                      () =>
                        api(`/classrooms/${classroomId}/members`, "POST", {
                          email: f.get("email"),
                          role: f.get("role"),
                        }),
                      "เพิ่มผู้ร่วมดูแลแล้ว",
                    );
                  }}
                >
                  <h3>เพิ่มผู้ร่วมดูแล</h3>
                  <label>
                    อีเมล Google
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    สิทธิ์
                    <select name="role">
                      <option value="CO_TEACHER">ผู้สอนร่วม</option>
                      <option value="TA">ผู้ช่วยสอน (TA)</option>
                    </select>
                  </label>
                  <button className="button secondary" disabled={busy}>
                    เพิ่มสมาชิก
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function AssignmentForm({
  classroomId,
  busy,
  onSave,
}: {
  classroomId: string;
  busy: boolean;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [criteria, setCriteria] = useState([
    { id: "group-quality", side: "GROUP", name: "คุณภาพผลงาน", weightPct: 100 },
    {
      id: "individual-teamwork",
      side: "INDIVIDUAL",
      name: "การมีส่วนร่วมในทีม",
      weightPct: 100,
    },
  ]);
  const [individualMaxScore, setIndividualMaxScore] = useState(5);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void onSave({
      classroomId,
      name: f.get("name"),
      opensAt: new Date(String(f.get("opensAt"))).toISOString(),
      closesAt: new Date(String(f.get("closesAt"))).toISOString(),
      criteria: criteria.filter(c => c.side === "GROUP" || individualMaxScore > 0),
      config: {
        groupMaxScore: Number(f.get("groupMaxScore")),
        individualMaxScore: Number(f.get("individualMaxScore")),
      },
    });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label>
        ชื่องาน
        <input
          name="name"
          required
          placeholder="Final Project · Peer Evaluation"
        />
      </label>
      <div className="form-row">
        <label>
          เริ่มประเมิน (เวลาบนอุปกรณ์)
          <input name="opensAt" type="datetime-local" required />
        </label>
        <label>
          ปิดรับ (เวลาบนอุปกรณ์)
          <input name="closesAt" type="datetime-local" required />
        </label>
      </div>
      <div className="form-row">
        <label>
          คะแนนเต็มกลุ่ม
          <input
            name="groupMaxScore"
            type="number"
            min="1"
            max="100"
            defaultValue="15"
            required
          />
        </label>
        <label>
          คะแนนเต็มรายบุคคล
          <input
            name="individualMaxScore"
            data-testid="individual-max-score"
            type="number"
            min="0"
            max="100"
            value={individualMaxScore}
            onChange={e => setIndividualMaxScore(Number(e.target.value))}
            required
          />
          <span className="muted">ใส่ 0 เพื่อปิดการประเมินรายบุคคล</span>
        </label>
      </div>
      {(individualMaxScore === 0 ? ["GROUP"] : ["GROUP", "INDIVIDUAL"]).map((side) => (
        <div key={side}>
          <h3>
            {side === "GROUP" ? "เกณฑ์งานกลุ่ม" : "เกณฑ์รายบุคคล"}{" "}
            <span className="muted">น้ำหนักรวม 100%</span>
          </h3>
          <div className="stack">
            {criteria
              .filter((c) => c.side === side)
              .map((c) => (
                <div className="criterion-row" key={c.id}>
                  <label>
                    ชื่อเกณฑ์
                    <input
                      value={c.name}
                      required
                      onChange={(e) =>
                        setCriteria(
                          criteria.map((x) =>
                            x.id === c.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    น้ำหนัก %
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={c.weightPct}
                      required
                      onChange={(e) =>
                        setCriteria(
                          criteria.map((x) =>
                            x.id === c.id
                              ? { ...x, weightPct: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`ลบเกณฑ์ ${c.name}`}
                    onClick={() =>
                      setCriteria(criteria.filter((x) => x.id !== c.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
          <button
            type="button"
            className="button secondary small"
            style={{ marginTop: 12 }}
            onClick={() =>
              setCriteria([
                ...criteria,
                { id: crypto.randomUUID(), side, name: "", weightPct: 10 },
              ])
            }
          >
            ＋ เพิ่มเกณฑ์
          </button>
        </div>
      ))}
      <p className="muted">
        คะแนนฐาน 60% · เข้าร่วมครบ 90% จะไม่ถูกลดคะแนน ·
        ผู้ประเมินต้องมีอย่างน้อย 3 คนก่อนเปิดเผยคะแนนรายบุคคล
      </p>
      <button className="button" disabled={busy}>
        บันทึกฉบับร่าง
      </button>
    </form>
  );
}
