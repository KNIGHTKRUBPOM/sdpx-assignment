import { randomUUID, createHmac } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import Decimal from "decimal.js";
import { parse } from "csv-parse/sync";
import type { Database, Transaction } from "../db/client";
import * as t from "../db/schema";
import { balancedGroupPairs, balancedIndividualPairs } from "./pairing";
import { computeFinalPersonalScore } from "../core/scoring/scoring-engine";
import {
  buildStudentSelfScoreView,
  exportToCsvString,
} from "../core/reports/reports";
import { computeQualitySignals } from "../core/quality-signals/quality-signals";
import {
  assignmentSchema,
  requireRule,
  roleSchema,
  sideSchema,
  type Context,
  type Role,
  type Snapshot,
} from "./model";
import {
  allowedDomain,
  assertOpen,
  effectiveStatus,
  rosterStaff,
  safeEmail,
  staff,
} from "./policy";
import { FORMULA_VERSION, scoreItem, type ScopedComparison } from "./scoring";
import { evaluationProgress, type MyProgress } from "./evaluation-progress";
import { instructorGuide } from "./instructor-guide";

type Executor = Database | Transaction;
const id = () => randomUUID();
export class PairEvalService {
  constructor(
    private db: Database,
    private ownerEmails: string[],
    private exportSecret: string,
  ) {}

  private async membership(
    db: Executor,
    ctx: Context,
    classroomId: string,
    roles?: Role[],
  ) {
    const [row] = await db
      .select({ member: t.members, classroom: t.classrooms })
      .from(t.members)
      .innerJoin(t.classrooms, eq(t.members.classroomId, t.classrooms.id))
      .where(
        and(
          eq(t.members.classroomId, classroomId),
          eq(t.members.userId, ctx.user.id),
        ),
      );
    requireRule(
      row && allowedDomain(ctx.user.email, row.classroom.domains),
      "NOT_FOUND",
      "ไม่พบห้องเรียนหรือไม่มีสิทธิ์เข้าถึง",
      404,
    );
    requireRule(
      !roles || roles.includes(row.member.role as Role),
      "FORBIDDEN",
      "ไม่มีสิทธิ์ทำรายการนี้",
      403,
    );
    return row;
  }

  private async assignment(
    db: Executor,
    ctx: Context,
    assignmentId: string,
    roles?: Role[],
  ) {
    const [a] = await db
      .select()
      .from(t.assignments)
      .where(eq(t.assignments.id, assignmentId));
    requireRule(a, "NOT_FOUND", "ไม่พบงาน", 404);
    const access = await this.membership(db, ctx, a.classroomId, roles);
    return { a, ...access };
  }

  // One lock per classroom serializes roster, answer and score mutations. No in-process locks.
  private async mutate<T>(
    ctx: Context,
    classroomId: string,
    action: (tx: Transaction) => Promise<T>,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from classrooms where id = ${classroomId} for update`,
      );
      const { classroom } = await this.membership(tx, ctx, classroomId);
      requireRule(!classroom.archivedAt, "CLASSROOM_ARCHIVED", "ห้องเรียนนี้เก็บถาวรแล้ว อ่านข้อมูลได้ แต่ไม่สามารถแก้ไขหรือส่งประเมินได้", 409);
      return action(tx);
    });
  }

  private async audit(
    db: Executor,
    ctx: Context,
    classroomId: string,
    action: string,
    assignmentId?: string,
    reason?: string,
    detail?: unknown,
  ) {
    await db.insert(t.events).values({
      id: id(),
      classroomId,
      actorId: ctx.user.id,
      action,
      assignmentId,
      reason,
      detail,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });
  }

  private async myProgress(ctx: Context, assignmentIds: string[]) {
    const rows = assignmentIds.length ? await this.db.select({ assignmentId: t.pairs.assignmentId, side: t.pairs.side, currentChoice: t.answers.draftChoice, submittedChoice: t.answers.submittedChoice })
      .from(t.pairs).innerJoin(t.assignments, and(eq(t.assignments.id, t.pairs.assignmentId), eq(t.assignments.generation, t.pairs.generation)))
      .leftJoin(t.answers, eq(t.answers.pairId, t.pairs.id))
      .where(and(inArray(t.pairs.assignmentId, assignmentIds), eq(t.pairs.evaluatorId, ctx.user.id))) : [];
    return Object.fromEntries(assignmentIds.map((id) => [id, Object.fromEntries((["GROUP", "INDIVIDUAL"] as const).map((side) => [side, evaluationProgress(rows.filter((r) => r.assignmentId === id && r.side === side))]))])) as Record<string, MyProgress>;
  }

  async dashboard(ctx: Context) {
    const rooms = await this.db
      .select({ classroom: t.classrooms, role: t.members.role })
      .from(t.members)
      .innerJoin(t.classrooms, eq(t.members.classroomId, t.classrooms.id))
      .where(eq(t.members.userId, ctx.user.id));
    const visible = rooms.filter((r) =>
      allowedDomain(ctx.user.email, r.classroom.domains),
    );
    const work = visible.length
      ? await this.db
          .select()
          .from(t.assignments)
          .where(
            inArray(
              t.assignments.classroomId,
              visible.map((r) => r.classroom.id),
            ),
          )
      : [];
    const [user] = await this.db
      .select()
      .from(t.users)
      .where(eq(t.users.id, ctx.user.id));
    const progress = await this.myProgress(ctx, work.map((a) => a.id));
    return {
      user: ctx.user,
      noticeAccepted: !!user?.noticeAcceptedAt,
      canCreateClassroom: this.ownerEmails
        .map(safeEmail)
        .includes(ctx.user.email),
      classrooms: visible.filter((r) => !r.classroom.archivedAt),
      archivedClassrooms: visible.filter((r) => !!r.classroom.archivedAt),
      assignments: work.map(({ snapshot: _snapshot, seed: _seed, ...a }) => ({
        ...a,
        status: effectiveStatus(a),
        myProgress: progress[a.id],
      })),
    };
  }

  async acceptNotice(ctx: Context) {
    await this.db
      .update(t.users)
      .set({ noticeAcceptedAt: new Date() })
      .where(eq(t.users.id, ctx.user.id));
    return { accepted: true };
  }

  async createClassroom(ctx: Context, body: unknown) {
    requireRule(
      this.ownerEmails.map(safeEmail).includes(ctx.user.email),
      "FORBIDDEN",
      "บัญชีนี้ยังไม่ได้รับสิทธิ์สร้างห้องเรียน",
      403,
    );
    const v = z
      .object({
        name: z.string().trim().min(1).max(100),
        slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
        domains: z
          .array(
            z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
          )
          .min(1)
          .max(20),
      })
      .parse(body);
    requireRule(
      allowedDomain(ctx.user.email, v.domains),
      "DOMAIN_REQUIRED",
      "ต้องรวม domain ของเจ้าของห้องด้วย",
    );
    return this.db.transaction(async (tx) => {
      const [room] = await tx
        .insert(t.classrooms)
        .values({ id: id(), ...v })
        .returning();
      await tx.insert(t.members).values({
        id: id(),
        classroomId: room.id,
        userId: ctx.user.id,
        role: "OWNER",
      });
      await this.audit(tx, ctx, room.id, "CREATE_CLASSROOM");
      return room;
    });
  }

  async archiveClassroom(ctx: Context, classroomId: string, body: unknown) {
    const v = z.object({ name: z.string(), reason: z.string().trim().min(3).max(1000) }).parse(body);
    return this.mutate(ctx, classroomId, async (tx) => {
      const { classroom } = await this.membership(tx, ctx, classroomId, ["OWNER"]);
      requireRule(v.name === classroom.name, "NAME_MISMATCH", "กรุณาพิมพ์ชื่อห้องเรียนให้ตรงกัน");
      const archivedAt = new Date();
      await tx.update(t.classrooms).set({ archivedAt }).where(eq(t.classrooms.id, classroomId));
      await this.audit(tx, ctx, classroomId, "ARCHIVE_CLASSROOM", undefined, v.reason, { before: { archivedAt: null }, after: { archivedAt: archivedAt.toISOString() } });
      return { archivedAt };
    });
  }

  async roster(ctx: Context, classroomId: string) {
    await this.membership(this.db, ctx, classroomId, rosterStaff);
    const people = await this.db
      .select({
        id: t.users.id,
        email: t.users.email,
        name: t.users.name,
        role: t.members.role,
        groupId: t.members.groupId,
      })
      .from(t.members)
      .innerJoin(t.users, eq(t.users.id, t.members.userId))
      .where(eq(t.members.classroomId, classroomId));
    const groups = await this.db
      .select()
      .from(t.groups)
      .where(eq(t.groups.classroomId, classroomId));
    return { members: people, groups };
  }

  async importRoster(ctx: Context, classroomId: string, csv: string) {
    requireRule(
      csv.length <= 100_000,
      "FILE_TOO_LARGE",
      "CSV ต้องไม่เกิน 100 KB",
    );
    let rows: Record<string, string>[];
    try {
      rows = parse(csv, {
        columns: true,
        bom: true,
        trim: true,
        skip_empty_lines: true,
      }) as Record<string, string>[];
    } catch {
      requireRule(false, "INVALID_CSV", "CSV ไม่ถูกต้อง");
    }
    requireRule(
      rows.length > 0 && rows.length <= 200,
      "ROSTER_SIZE",
      "รองรับรายชื่อ 1–200 คน",
    );
    const clean = rows.map((r, i) => ({
      email: safeEmail(z.email().parse(r.email)),
      name: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .parse(r.display_name || r.email),
      group: z.string().trim().min(1).max(100).parse(r.group_name),
      row: i + 2,
    }));
    requireRule(
      new Set(clean.map((r) => r.email)).size === clean.length,
      "DUPLICATE_EMAIL",
      "มีอีเมลซ้ำใน CSV",
    );
    const grouped = Map.groupBy(clean, (r) => r.group);
    for (const [name, rows] of grouped)
      requireRule(
        rows.length >= 2 && rows.length <= 8,
        "GROUP_SIZE",
        `กลุ่ม ${name} ต้องมี 2–8 คน`,
      );
    return this.mutate(ctx, classroomId, async (tx) => {
      const { classroom } = await this.membership(
        tx,
        ctx,
        classroomId,
        rosterStaff,
      );
      const work = await tx
        .select()
        .from(t.assignments)
        .where(eq(t.assignments.classroomId, classroomId));
      requireRule(
        work.every((a) => a.status === "DRAFT"),
        "ROSTER_LOCKED",
        "แก้กลุ่มได้ก่อน publish เท่านั้น",
        409,
      );
      requireRule(
        clean.every((r) => allowedDomain(r.email, classroom.domains)),
        "DOMAIN_NOT_ALLOWED",
        "CSV มีอีเมลนอก domain ที่ห้องอนุญาต",
      );
      const existingMembers = await tx
        .select()
        .from(t.members)
        .where(eq(t.members.classroomId, classroomId));
      const existingGroups = await tx
        .select()
        .from(t.groups)
        .where(eq(t.groups.classroomId, classroomId));
      for (const [name, rows] of grouped) {
        let group = existingGroups.find((g) => g.name === name);
        if (!group)
          [group] = await tx
            .insert(t.groups)
            .values({ id: id(), classroomId, name })
            .returning();
        for (const row of rows) {
          let [user] = await tx
            .select()
            .from(t.users)
            .where(eq(t.users.email, row.email));
          if (!user)
            [user] = await tx
              .insert(t.users)
              .values({ id: id(), email: row.email, name: row.name })
              .onConflictDoUpdate({
                target: t.users.email,
                set: { name: row.name },
              })
              .returning();
          const membership = existingMembers.find((m) => m.userId === user.id);
          requireRule(
            !membership || membership.role === "STUDENT",
            "STAFF_IN_ROSTER",
            "รายชื่อนักศึกษามีบัญชีผู้สอน/TA อยู่ด้วย",
          );
          await tx
            .insert(t.members)
            .values({
              id: id(),
              classroomId,
              userId: user.id,
              role: "STUDENT",
              groupId: group.id,
            })
            .onConflictDoUpdate({
              target: [t.members.classroomId, t.members.userId],
              set: { groupId: group.id },
            });
        }
      }
      // Validate the resulting roster too, including rows not present in this import.
      const result = await this.classData(tx, classroomId);
      requireRule(
        result.students.length <= 200 &&
          result.groups.every(
            (g) => g.memberIds.length >= 2 && g.memberIds.length <= 8,
          ),
        "GROUP_SIZE",
        "รายชื่อรวมทำให้บางกลุ่มเล็ก/ใหญ่เกินไป",
      );
      await this.audit(
        tx,
        ctx,
        classroomId,
        "IMPORT_ROSTER",
        undefined,
        undefined,
        { count: clean.length },
      );
      return { importedStudents: clean.length, importedGroups: grouped.size };
    });
  }

  async addMember(ctx: Context, classroomId: string, body: unknown) {
    const v = z
      .object({
        email: z.email(),
        role: roleSchema.exclude(["OWNER", "STUDENT"]),
      })
      .parse(body);
    return this.mutate(ctx, classroomId, async (tx) => {
      const { classroom } = await this.membership(tx, ctx, classroomId, [
        "OWNER",
      ]);
      const email = safeEmail(v.email);
      requireRule(
        allowedDomain(email, classroom.domains),
        "DOMAIN_NOT_ALLOWED",
        "อีเมลนอก domain ที่อนุญาต",
      );
      let [user] = await tx
        .select()
        .from(t.users)
        .where(eq(t.users.email, email));
      if (!user)
        [user] = await tx
          .insert(t.users)
          .values({ id: id(), email, name: email.split("@")[0] })
          .onConflictDoUpdate({ target: t.users.email, set: { email } })
          .returning();
      const [existing] = await tx
        .select()
        .from(t.members)
        .where(
          and(
            eq(t.members.classroomId, classroomId),
            eq(t.members.userId, user.id),
          ),
        );
      requireRule(!existing, "ALREADY_MEMBER", "บัญชีนี้เป็นสมาชิกแล้ว", 409);
      await tx
        .insert(t.members)
        .values({ id: id(), classroomId, userId: user.id, role: v.role });
      await this.audit(
        tx,
        ctx,
        classroomId,
        "ADD_MEMBER",
        undefined,
        undefined,
        { userId: user.id, role: v.role },
      );
      return { added: true };
    });
  }

  async updateArtifact(
    ctx: Context,
    classroomId: string,
    groupId: string,
    body: unknown,
  ) {
    const { artifactUrl } = z
      .object({
        artifactUrl: z
          .url()
          .refine((v) => /^https?:\/\//.test(v), "ใช้ URL แบบ https/http"),
      })
      .parse(body);
    return this.mutate(ctx, classroomId, async (tx) => {
      await this.membership(tx, ctx, classroomId, rosterStaff);
      const work = await tx
        .select()
        .from(t.assignments)
        .where(eq(t.assignments.classroomId, classroomId));
      requireRule(
        work.every((a) => a.status === "DRAFT"),
        "ROSTER_LOCKED",
        "ลิงก์ผลงานถูกล็อกหลัง publish",
        409,
      );
      const changed = await tx
        .update(t.groups)
        .set({ artifactUrl })
        .where(
          and(eq(t.groups.id, groupId), eq(t.groups.classroomId, classroomId)),
        )
        .returning();
      requireRule(changed.length, "NOT_FOUND", "ไม่พบกลุ่ม", 404);
      await this.audit(tx, ctx, classroomId, "UPDATE_ARTIFACT");
      return changed[0];
    });
  }

  async createAssignment(ctx: Context, body: unknown) {
    const v = assignmentSchema.parse(body);
    return this.mutate(ctx, v.classroomId, async (tx) => {
      await this.membership(tx, ctx, v.classroomId, staff);
      const [created] = await tx
        .insert(t.assignments)
        .values({
          id: id(),
          ...v,
          opensAt: new Date(v.opensAt),
          closesAt: new Date(v.closesAt),
          seed: id(),
        })
        .returning();
      await this.audit(tx, ctx, v.classroomId, "CREATE_ASSIGNMENT", created.id);
      return { id: created.id, status: created.status };
    });
  }

  async editAssignment(ctx: Context, assignmentId: string, body: unknown) {
    const v = assignmentSchema.parse(body);
    const { a: initial } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
      staff,
    );
    requireRule(
      v.classroomId === initial.classroomId,
      "CLASSROOM_MISMATCH",
      "ย้ายงานข้ามห้องไม่ได้",
    );
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, staff);
      requireRule(
        a.status === "DRAFT",
        "INVALID_STATE",
        "แก้ไขได้เฉพาะฉบับร่าง",
        409,
      );
      await tx
        .update(t.assignments)
        .set({
          name: v.name,
          config: v.config,
          criteria: v.criteria,
          opensAt: new Date(v.opensAt),
          closesAt: new Date(v.closesAt),
        })
        .where(eq(t.assignments.id, assignmentId));
      await this.audit(tx, ctx, a.classroomId, "EDIT_ASSIGNMENT", assignmentId);
      return { id: assignmentId, status: "DRAFT" };
    });
  }

  async assignInstructor(ctx: Context, assignmentId: string, body: unknown) {
    const v = z
      .object({
        criterionId: z.string(),
        itemAId: z.string(),
        itemBId: z.string(),
      })
      .parse(body);
    const { a: initial } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
      staff,
    );
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, staff);
      assertOpen(a);
      const criterion = a.criteria.find((c) => c.id === v.criterionId);
      requireRule(
        criterion && v.itemAId !== v.itemBId,
        "INVALID_PAIR",
        "คู่หรือเกณฑ์ไม่ถูกต้อง",
      );
      requireRule(criterion.side !== "INDIVIDUAL" || a.config.individualMaxScore > 0,
        "INDIVIDUAL_DISABLED", "งานนี้ปิดการประเมินรายบุคคล", 409);
      const data = await this.classData(tx, a.classroomId);
      if (criterion.side === "GROUP")
        requireRule(
          [v.itemAId, v.itemBId].every((id) =>
            data.groups.some((g) => g.id === id),
          ),
          "INVALID_PAIR",
          "กลุ่มไม่อยู่ในห้องเรียน",
        );
      else
        requireRule(
          data.students.some((s) => s.id === v.itemAId) &&
            data.students.find((s) => s.id === v.itemAId)?.groupId ===
              data.students.find((s) => s.id === v.itemBId)?.groupId,
          "INVALID_PAIR",
          "นักศึกษาต้องอยู่กลุ่มเดียวกัน",
        );
      const [itemAId, itemBId] = [v.itemAId, v.itemBId].sort();
      await tx
        .insert(t.pairs)
        .values({
          id: id(),
          assignmentId,
          criterionId: criterion.id,
          side: criterion.side,
          evaluatorId: ctx.user.id,
          itemAId,
          itemBId,
          leftId:
            parseInt(
              createHmac("sha256", a.seed)
                .update(`${ctx.user.id}:${criterion.id}:${itemAId}:${itemBId}`)
                .digest("hex")
                .slice(0, 2),
              16,
            ) % 2
              ? itemAId
              : itemBId,
          generation: a.generation,
        })
        .onConflictDoNothing();
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "ASSIGN_INSTRUCTOR_PAIR",
        assignmentId,
        undefined,
        v,
      );
      return { side: criterion.side };
    });
  }

  private async classData(db: Executor, classroomId: string) {
    const groupRows = await db
      .select()
      .from(t.groups)
      .where(eq(t.groups.classroomId, classroomId));
    const rows = await db
      .select({
        id: t.users.id,
        email: t.users.email,
        displayName: t.users.name,
        groupId: t.members.groupId,
        role: t.members.role,
      })
      .from(t.members)
      .innerJoin(t.users, eq(t.members.userId, t.users.id))
      .where(eq(t.members.classroomId, classroomId));
    const students = rows
      .filter((r) => r.role === "STUDENT" && r.groupId)
      .map((r) => ({ ...r, groupId: r.groupId! }));
    const groups = groupRows
      .filter((g) => students.some((s) => s.groupId === g.id))
      .map((g) => ({
        ...g,
        memberIds: students.filter((s) => s.groupId === g.id).map((s) => s.id),
      }));
    return { groups, students, rows };
  }

  async detail(ctx: Context, assignmentId: string) {
    const { a, member, classroom } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
    );
    const { snapshot: _snapshot, seed: _seed, ...publicAssignment } = a;
    const guide = staff.includes(member.role as Role) && a.status !== "DRAFT" && a.config.individualMaxScore > 0
      ? (async () => {
          const [data, rows] = await Promise.all([
            this.classData(this.db, a.classroomId),
            this.db.select({ criterionId: t.pairs.criterionId, itemAId: t.pairs.itemAId, itemBId: t.pairs.itemBId, evaluatorId: t.pairs.evaluatorId, submittedChoice: t.answers.submittedChoice })
              .from(t.pairs).leftJoin(t.answers, eq(t.answers.pairId, t.pairs.id))
              .where(and(eq(t.pairs.assignmentId, assignmentId), eq(t.pairs.generation, a.generation), eq(t.pairs.side, "INDIVIDUAL"))),
          ]);
          return instructorGuide(rows, data.students.map(s => ({ id: s.id, name: s.displayName, groupName: data.groups.find(g => g.id === s.groupId)?.name ?? "" })), a.criteria, ctx.user.id);
        })() : Promise.resolve(undefined);
    const [myProgress, guidance] = await Promise.all([this.myProgress(ctx, [assignmentId]), guide]);
    return {
      assignment: { ...publicAssignment, status: effectiveStatus(a) },
      role: member.role,
      classroomName: classroom.name,
      classroomArchived: !!classroom.archivedAt,
      myProgress: myProgress[assignmentId],
      instructorGuide: guidance,
    };
  }

  async feasibility(ctx: Context, assignmentId: string) {
    const { a } = await this.assignment(this.db, ctx, assignmentId, staff);
    const data = await this.classData(this.db, a.classroomId);
    return balancedGroupPairs({
      assignmentId: a.id,
      criterionId: a.criteria.find((c) => c.side === "GROUP")!.id,
      ...data,
      seed: a.seed,
      targetCoverage: a.config.targetCoverage,
      maxWorkload: a.config.maxWorkload,
      generation: a.generation,
    }).feasibility;
  }

  async publish(ctx: Context, assignmentId: string, body: unknown) {
    const v = z
      .object({ acceptReducedCoverage: z.boolean().default(false) })
      .parse(body);
    const { a: initial } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
      staff,
    );
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, staff);
      requireRule(
        a.status === "DRAFT",
        "INVALID_STATE",
        "publish ได้เฉพาะฉบับร่าง",
        409,
      );
      requireRule(
        new Date() < a.closesAt,
        "DEADLINE_PASSED",
        "วันปิดผ่านไปแล้ว",
      );
      const data = await this.classData(tx, a.classroomId);
      requireRule(
        data.groups.every((g) => g.artifactUrl),
        "MISSING_ARTIFACT",
        "เพิ่มลิงก์ผลงานทุกกลุ่มก่อน publish",
      );
      const feasibility = balancedGroupPairs({
        assignmentId,
        criterionId: a.criteria.find((c) => c.side === "GROUP")!.id,
        ...data,
        seed: a.seed,
        targetCoverage: a.config.targetCoverage,
        maxWorkload: a.config.maxWorkload,
        generation: a.generation,
      }).feasibility;
      requireRule(
        feasibility.achievableCoverage > 0,
        "INFEASIBLE",
        feasibility.message,
      );
      requireRule(
        feasibility.feasible || v.acceptReducedCoverage,
        "CONFIRM_COVERAGE",
        feasibility.message,
        409,
      );
      const generated = a.criteria.filter(c => c.side === "GROUP" || a.config.individualMaxScore > 0).flatMap((c) =>
        c.side === "GROUP"
          ? balancedGroupPairs({
              assignmentId,
              criterionId: c.id,
              ...data,
              seed: a.seed,
              targetCoverage: a.config.targetCoverage,
              maxWorkload: a.config.maxWorkload,
              generation: a.generation,
            }).pairAssignments
          : data.groups
              .filter((g) => g.memberIds.length > 2)
              .flatMap(
                (group) =>
                  balancedIndividualPairs({
                    assignmentId,
                    criterionId: c.id,
                    group,
                    seed: a.seed,
                    maxWorkload: a.config.maxWorkload,
                    generation: a.generation,
                  }).pairAssignments,
              ),
      );
      requireRule(generated.length, "NO_PAIRS", "ไม่มีคู่ให้ประเมิน");
      for (let start = 0; start < generated.length; start += 500)
        await tx.insert(t.pairs).values(
          generated.slice(start, start + 500).map((p) => ({
            id: id(),
            assignmentId,
            criterionId: p.criterionId,
            side: p.side,
            evaluatorId: p.evaluatorUserId,
            itemAId: p.itemAId,
            itemBId: p.itemBId,
            leftId: p.displayLeftItemId,
            generation: a.generation,
          })),
        );
      await tx
        .update(t.assignments)
        .set({ status: "PUBLISHED" })
        .where(eq(t.assignments.id, assignmentId));
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "PUBLISH_ASSIGNMENT",
        assignmentId,
        undefined,
        { pairCount: generated.length, feasibility },
      );
      return {
        pairCount: generated.length,
        status: effectiveStatus({ ...a, status: "PUBLISHED" }),
      };
    });
  }

  async evaluations(ctx: Context, assignmentId: string, rawSide: unknown) {
    const side = sideSchema.parse(rawSide);
    const { a, member } = await this.assignment(this.db, ctx, assignmentId, [
      "STUDENT",
      ...staff,
    ]);
    requireRule(
      a.status !== "DRAFT",
      "NOT_OPEN",
      "งานยังไม่เปิดให้ประเมิน",
      409,
    );
    const data = await this.classData(this.db, a.classroomId);
    const list = await this.db
      .select({ pair: t.pairs, answer: t.answers })
      .from(t.pairs)
      .leftJoin(t.answers, eq(t.answers.pairId, t.pairs.id))
      .where(
        and(
          eq(t.pairs.assignmentId, assignmentId),
          eq(t.pairs.evaluatorId, ctx.user.id),
          eq(t.pairs.side, side),
          eq(t.pairs.generation, a.generation),
        ),
      );
    const items =
      side === "GROUP"
        ? data.groups.map((g) => ({
            id: g.id,
            name: g.name,
            url: g.artifactUrl,
          }))
        : data.students.map((s) => ({
            id: s.id,
            name: s.displayName,
            url: "",
          }));
    return {
      assignmentId,
      side,
      status: effectiveStatus(a),
      closesAt: a.closesAt,
      criteria: a.criteria.filter((c) => c.side === side),
      config: a.config,
      role: member.role,
      comparisons: list.map(({ pair: p, answer }) => ({
        pairAssignmentId: p.id,
        criterionId: p.criterionId,
        leftItem: items.find((i) => i.id === p.leftId),
        rightItem: items.find(
          (i) => i.id === (p.leftId === p.itemAId ? p.itemBId : p.itemAId),
        ),
        currentChoice: answer?.draftChoice ?? null,
        submittedChoice: answer?.submittedChoice ?? null,
        version: answer?.version ?? 0,
      })),
    };
  }

  async save(ctx: Context, pairId: string, body: unknown) {
    const v = z
      .object({
        choice: z.number().int().min(1).max(6),
        expectedVersion: z.number().int().min(0),
        timeOnTaskMs: z.number().int().min(0).max(86_400_000).default(0),
      })
      .parse(body);
    const [p] = await this.db
      .select()
      .from(t.pairs)
      .where(eq(t.pairs.id, pairId));
    requireRule(
      p && p.evaluatorId === ctx.user.id,
      "NOT_FOUND",
      "ไม่พบคู่ประเมิน",
      404,
    );
    const { a: initial } = await this.assignment(this.db, ctx, p.assignmentId);
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, p.assignmentId, [
        "STUDENT",
        ...staff,
      ]);
      assertOpen(a);
      requireRule(
        p.generation === a.generation,
        "STALE_GENERATION",
        "คู่ประเมินมีการเปลี่ยนแปลง",
        409,
      );
      const [old] = await tx
        .select()
        .from(t.answers)
        .where(eq(t.answers.pairId, pairId));
      if (
        old &&
        old.version === v.expectedVersion + 1 &&
        old.draftChoice === v.choice
      )
        return old;
      requireRule(
        (old?.version ?? 0) === v.expectedVersion,
        "VERSION_CONFLICT",
        "มีการแก้จากอีกหน้าต่าง กรุณาโหลดใหม่",
        409,
      );
      const [saved] = await tx
        .insert(t.answers)
        .values({
          pairId,
          draftChoice: v.choice,
          version: v.expectedVersion + 1,
          timeOnTaskMs: v.timeOnTaskMs,
        })
        .onConflictDoUpdate({
          target: t.answers.pairId,
          set: {
            draftChoice: v.choice,
            version: v.expectedVersion + 1,
            timeOnTaskMs: v.timeOnTaskMs,
          },
        })
        .returning();
      return saved;
    });
  }

  async submit(
    ctx: Context,
    assignmentId: string,
    body: unknown,
    key: string | null,
  ) {
    const { side } = z.object({ side: sideSchema }).parse(body);
    requireRule(
      key && key.length >= 8 && key.length <= 150,
      "IDEMPOTENCY_REQUIRED",
      "ต้องส่ง Idempotency-Key",
    );
    const { a: initial } = await this.assignment(this.db, ctx, assignmentId, [
      "STUDENT",
      ...staff,
    ]);
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, [
        "STUDENT",
        ...staff,
      ]);
      const [replay] = await tx
        .select()
        .from(t.submissions)
        .where(
          and(
            eq(t.submissions.assignmentId, assignmentId),
            eq(t.submissions.userId, ctx.user.id),
            eq(t.submissions.key, key),
          ),
        );
      if (replay) {
        requireRule(
          replay.fingerprint === side,
          "IDEMPOTENCY_CONFLICT",
          "key นี้ใช้กับคำขออื่นแล้ว",
          409,
        );
        return replay.result;
      }
      assertOpen(a);
      const list = await tx
        .select({ pair: t.pairs, answer: t.answers })
        .from(t.pairs)
        .leftJoin(t.answers, eq(t.answers.pairId, t.pairs.id))
        .where(
          and(
            eq(t.pairs.assignmentId, assignmentId),
            eq(t.pairs.evaluatorId, ctx.user.id),
            eq(t.pairs.side, side),
            eq(t.pairs.generation, a.generation),
          ),
        );
      let count = 0;
      for (const { pair, answer } of list) {
        if (!answer) continue;
        await tx.insert(t.revisions).values({
          id: id(),
          pairId: pair.id,
          choice: answer.draftChoice,
          version: answer.version,
        });
        await tx
          .update(t.answers)
          .set({ submittedChoice: answer.draftChoice, submittedAt: new Date() })
          .where(eq(t.answers.pairId, pair.id));
        count++;
      }
      const result = {
        submittedCount: count,
        assignedCount: list.length,
        participationRatio: list.length ? count / list.length : 1,
      };
      await tx.insert(t.submissions).values({
        id: id(),
        assignmentId,
        userId: ctx.user.id,
        key,
        fingerprint: side,
        result,
      });
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "SUBMIT",
        assignmentId,
        undefined,
        { side, count },
      );
      return result;
    });
  }

  private async compute(
    db: Executor,
    a: typeof t.assignments.$inferSelect,
  ): Promise<Snapshot> {
    const data = await this.classData(db, a.classroomId);
    const list = await db
      .select({ pair: t.pairs, answer: t.answers })
      .from(t.pairs)
      .leftJoin(t.answers, eq(t.answers.pairId, t.pairs.id))
      .where(
        and(
          eq(t.pairs.assignmentId, a.id),
          eq(t.pairs.generation, a.generation),
        ),
      );
    const comparisons: ScopedComparison[] = list
      .filter((x) => x.answer?.submittedChoice)
      .map(({ pair: p, answer }) => ({
        id: p.id,
        pairAssignmentId: p.id,
        assignmentId: a.id,
        criterionId: p.criterionId,
        evaluatorUserId: p.evaluatorId,
        isInstructor: staff.includes(
          data.rows.find((r) => r.id === p.evaluatorId)?.role as Role,
        ),
        itemLeftId: p.leftId,
        itemRightId: p.leftId === p.itemAId ? p.itemBId : p.itemAId,
        choice: answer!.submittedChoice as 1 | 2 | 3 | 4 | 5 | 6,
        status: "SUBMITTED",
        timeOnTaskMs: answer!.timeOnTaskMs,
      }));
    const groupScores = data.groups.map((g) =>
      scoreItem(a.id, g.id, "GROUP", a.criteria, comparisons, a.config),
    );
    const students = data.students.map((s) => {
      const group = groupScores.find((g) => g.itemId === s.groupId)!;
      const individual = scoreItem(
        a.id,
        s.id,
        "INDIVIDUAL",
        a.criteria,
        comparisons,
        a.config,
      );
      const own = list.filter((p) => p.pair.evaluatorId === s.id);
      const counts = (side: string, submitted: boolean) =>
        own.filter(
          (p) =>
            p.pair.side === side && (!submitted || p.answer?.submittedChoice),
        ).length;
      const personal = computeFinalPersonalScore({
        studentId: s.id,
        groupId: s.groupId,
        groupComponentScore: group.totalComponentScore,
        individualComponentScore: individual.totalComponentScore,
        assignedGroupComparisons: counts("GROUP", false),
        submittedGroupComparisons: counts("GROUP", true),
        assignedIndividualComparisons: counts("INDIVIDUAL", false),
        submittedIndividualComparisons: counts("INDIVIDUAL", true),
        completionThreshold: a.config.completionThreshold,
        isFinal: a.status === "FINALIZED",
      });
      personal.finalPersonalScore = new Decimal(group.totalComponentScore)
        .plus(individual.totalComponentScore)
        .times(personal.multiplier)
        .toNumber();
      return {
        studentId: s.id,
        name: s.displayName,
        groupId: s.groupId,
        group,
        individual,
        personal,
        evaluatorCount: new Set(
          comparisons
            .filter((c) => c.itemLeftId === s.id || c.itemRightId === s.id)
            .map((c) => c.evaluatorUserId),
        ).size,
      };
    });
    const pairAssignments = list.map(({ pair: p }) => ({
      id: p.id,
      assignmentId: p.assignmentId,
      criterionId: p.criterionId,
      side: sideSchema.parse(p.side),
      evaluatorUserId: p.evaluatorId,
      itemAId: p.itemAId,
      itemBId: p.itemBId,
      displayLeftItemId: p.leftId,
      generation: p.generation,
    }));
    return {
      formulaVersion: FORMULA_VERSION,
      computedAt: new Date().toISOString(),
      config: a.config,
      criteria: a.criteria,
      comparisons,
      pairAssignments,
      students,
      groups: groupScores,
    };
  }

  async reports(ctx: Context, assignmentId: string, report: string) {
    const { a } = await this.assignment(this.db, ctx, assignmentId, staff);
    const snapshot = a.snapshot ?? (await this.compute(this.db, a));
    if (report === "group") {
      const data = await this.classData(this.db, a.classroomId);
      return snapshot.groups.map((g) => ({
        ...g,
        name: data.groups.find((row) => row.id === g.itemId)?.name ?? "กลุ่ม",
      }));
    }
    if (report === "individual") {
      const changes = await this.db
        .select()
        .from(t.overrides)
        .where(eq(t.overrides.assignmentId, assignmentId))
        .orderBy(t.overrides.createdAt);
      return snapshot.students.map((s) => ({
        ...s,
        personal: {
          ...s.personal,
          finalPersonalScore: Number(
            changes.filter((o) => o.studentId === s.studentId).at(-1)?.value ??
              s.personal.finalPersonalScore,
          ),
        },
      }));
    }
    if (report === "quality")
      return computeQualitySignals(
        snapshot.groups.map((g) => g.itemId),
        snapshot.comparisons.map((c) => ({
          ...c,
          evaluatorUserId: `EVAL-${createHmac("sha256", this.exportSecret).update(`${assignmentId}:${c.evaluatorUserId}`).digest("hex").slice(0, 16)}`,
        })),
      );
    if (report === "coverage") {
      const assigned = await this.db
        .select()
        .from(t.pairs)
        .where(
          and(
            eq(t.pairs.assignmentId, assignmentId),
            eq(t.pairs.generation, a.generation),
          ),
        );
      const result = new Map<
        string,
        {
          criterionId: string;
          itemAId: string;
          itemBId: string;
          assigned: number;
          submitted: number;
        }
      >();
      for (const p of assigned) {
        const key = `${p.criterionId}:${p.itemAId}:${p.itemBId}`;
        const row = result.get(key) ?? {
          criterionId: p.criterionId,
          itemAId: p.itemAId,
          itemBId: p.itemBId,
          assigned: 0,
          submitted: 0,
        };
        row.assigned++;
        if (snapshot.comparisons.some((c) => c.id === p.id)) row.submitted++;
        result.set(key, row);
      }
      const data = await this.classData(this.db, a.classroomId);
      const names = new Map([
        ...data.groups.map((g) => [g.id, g.name] as const),
        ...data.students.map((s) => [s.id, s.displayName] as const),
      ]);
      return [...result.values()].map((row) => ({
        ...row,
        criterionName: a.criteria.find((c) => c.id === row.criterionId)?.name,
        itemAName: names.get(row.itemAId),
        itemBName: names.get(row.itemBId),
      }));
    }
    requireRule(false, "UNKNOWN_REPORT", "ไม่พบรายงาน", 404);
  }

  async myScore(ctx: Context, assignmentId: string) {
    const { a } = await this.assignment(this.db, ctx, assignmentId, [
      "STUDENT",
    ]);
    const snapshot = a.snapshot ?? (await this.compute(this.db, a));
    const s = snapshot.students.find((s) => s.studentId === ctx.user.id);
    requireRule(s, "NOT_FOUND", "ไม่พบคะแนน", 404);
    const view = buildStudentSelfScoreView({
      studentId: s.studentId,
      groupSummary: s.group,
      personalResult: s.personal,
      individualSubmittedEvaluatorsCount: s.evaluatorCount,
      isFinal: !!a.snapshot,
    });
    if (a.config.individualMaxScore === 0) {
      view.finalPersonalScore = s.personal.finalPersonalScore;
      view.individualScore = 0;
      view.statusMessage = undefined;
    }
    const history = await this.db
      .select()
      .from(t.overrides)
      .where(
        and(
          eq(t.overrides.assignmentId, assignmentId),
          eq(t.overrides.studentId, ctx.user.id),
        ),
      )
      .orderBy(t.overrides.createdAt);
    if (view.finalPersonalScore !== undefined && history.length)
      view.finalPersonalScore = Number(history.at(-1)!.value);
    return view;
  }

  async finalize(ctx: Context, assignmentId: string, body: unknown) {
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .parse(body);
    const { a: initial } = await this.assignment(this.db, ctx, assignmentId, [
      "OWNER",
    ]);
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, ["OWNER"]);
      requireRule(
        effectiveStatus(a) === "CLOSED",
        "INVALID_STATE",
        "ปิดรับประเมินก่อน finalize",
        409,
      );
      const snapshot = await this.compute(tx, a);
      snapshot.students.forEach((s) => {
        s.personal.isFinal = true;
      });
      await tx
        .update(t.assignments)
        .set({ status: "FINALIZED", snapshot, finalizedAt: new Date() })
        .where(eq(t.assignments.id, assignmentId));
      if (snapshot.students.length)
        await tx.insert(t.scores).values(
          snapshot.students.map((s) => ({
            id: id(),
            assignmentId,
            studentId: s.studentId,
            value: new Decimal(s.personal.finalPersonalScore).toFixed(8),
          })),
        );
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "FINALIZE_ASSIGNMENT",
        assignmentId,
        reason,
        { formulaVersion: snapshot.formulaVersion },
      );
      return { status: "FINALIZED" };
    });
  }

  async close(ctx: Context, assignmentId: string, body: unknown) {
    const { reason } = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .parse(body);
    const { a: initial } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
      staff,
    );
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, staff);
      requireRule(
        ["OPEN", "PUBLISHED"].includes(a.status),
        "INVALID_STATE",
        "งานไม่ได้เปิดรับประเมิน",
        409,
      );
      await tx
        .update(t.assignments)
        .set({ status: "CLOSED" })
        .where(eq(t.assignments.id, assignmentId));
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "CLOSE_ASSIGNMENT",
        assignmentId,
        reason,
      );
      return { status: "CLOSED" };
    });
  }

  async override(ctx: Context, assignmentId: string, body: unknown) {
    const v = z
      .object({
        studentId: z.string(),
        value: z.number().min(0),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(body);
    const { a: initial } = await this.assignment(this.db, ctx, assignmentId, [
      "OWNER",
    ]);
    return this.mutate(ctx, initial.classroomId, async (tx) => {
      const { a } = await this.assignment(tx, ctx, assignmentId, ["OWNER"]);
      requireRule(
        a.snapshot &&
          a.snapshot.students.some((s) => s.studentId === v.studentId),
        "INVALID_STATE",
        "ต้อง finalize และมีนักศึกษาคนนี้ก่อน",
        409,
      );
      requireRule(
        v.value <= a.config.groupMaxScore + a.config.individualMaxScore,
        "SCORE_RANGE",
        "คะแนนเกินคะแนนเต็ม",
      );
      await tx.insert(t.overrides).values({
        id: id(),
        assignmentId,
        ...v,
        value: new Decimal(v.value).toFixed(8),
      });
      await this.audit(
        tx,
        ctx,
        a.classroomId,
        "SCORE_OVERRIDE",
        assignmentId,
        v.reason,
        v,
      );
      return { updated: true };
    });
  }

  async auditLog(ctx: Context, assignmentId: string) {
    const { a } = await this.assignment(this.db, ctx, assignmentId, ["OWNER"]);
    await this.audit(
      this.db,
      ctx,
      a.classroomId,
      "VIEW_AUDIT_IDENTITIES",
      assignmentId,
    );
    return this.db
      .select()
      .from(t.events)
      .where(eq(t.events.assignmentId, assignmentId));
  }

  async export(ctx: Context, assignmentId: string, body: unknown) {
    const v = z
      .object({
        report: z.enum(["individual", "group", "raw"]).default("individual"),
        includeIdentities: z.boolean().default(false),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(body);
    const { a, member } = await this.assignment(
      this.db,
      ctx,
      assignmentId,
      staff,
    );
    if (v.includeIdentities) {
      requireRule(
        member.role === "OWNER" && v.reason && v.reason.length >= 3,
        "IDENTITY_EXPORT_DENIED",
        "Owner ต้องระบุเหตุผลในการเปิดเผยผู้ประเมิน",
        403,
      );
      await this.audit(
        this.db,
        ctx,
        a.classroomId,
        "EXPORT_IDENTITIES",
        assignmentId,
        v.reason,
      );
    }
    const snapshot = a.snapshot ?? (await this.compute(this.db, a));
    if (v.report === "raw")
      return exportToCsvString(
        ["evaluator", "criterion", "left", "right", "choice"],
        snapshot.comparisons.map((c) => [
          v.includeIdentities
            ? c.evaluatorUserId
            : `EVAL-${createHmac("sha256", this.exportSecret).update(`${assignmentId}:${c.evaluatorUserId}`).digest("hex").slice(0, 16)}`,
          c.criterionId!,
          v.includeIdentities
            ? c.itemLeftId
            : `ITEM-${createHmac("sha256", this.exportSecret).update(`${assignmentId}:item:${c.itemLeftId}`).digest("hex").slice(0, 16)}`,
          v.includeIdentities
            ? c.itemRightId
            : `ITEM-${createHmac("sha256", this.exportSecret).update(`${assignmentId}:item:${c.itemRightId}`).digest("hex").slice(0, 16)}`,
          c.choice,
        ]),
      );
    if (v.report === "group")
      return exportToCsvString(
        ["group", "score", "flags", "formula"],
        snapshot.groups.map((g) => [
          g.itemId,
          g.totalComponentScore,
          g.flags.join(";"),
          snapshot.formulaVersion,
        ]),
      );
    const changes = await this.db
      .select()
      .from(t.overrides)
      .where(eq(t.overrides.assignmentId, assignmentId))
      .orderBy(t.overrides.createdAt);
    return exportToCsvString(
      [
        "student",
        "name",
        "group",
        "group_score",
        "individual_score",
        "participation",
        "multiplier",
        "final_score",
        "status",
        "formula",
      ],
      snapshot.students.map((s) => [
        s.studentId,
        s.name,
        s.groupId,
        s.group.totalComponentScore,
        s.individual.totalComponentScore,
        s.personal.participationRatio,
        s.personal.multiplier,
        Number(
          changes.filter((o) => o.studentId === s.studentId).at(-1)?.value ??
            s.personal.finalPersonalScore,
        ),
        a.snapshot ? "FINAL" : "INTERIM",
        snapshot.formulaVersion,
      ]),
    );
  }
}
