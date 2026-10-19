import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { PairEvalService } from "../../src/domain/service";
import { handleRequest } from "../../src/http/handler";
import type { Context, Principal } from "../../src/domain/model";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Integration tests require an isolated database ending in _test",
  );
const { db, client } = connectDatabase(url);
const suffix = crypto.randomUUID();
const owner: Principal = {
  id: crypto.randomUUID(),
  email: `owner-${suffix}@example.edu`,
  name: "Owner",
};
const outsider: Principal = {
  id: crypto.randomUUID(),
  email: `outside-${suffix}@example.edu`,
  name: "Other room",
};
const ctx = (user: Principal): Context => ({
  user,
  requestId: crypto.randomUUID(),
});
const service = new PairEvalService(db, [owner.email], "test-export-secret");
let classroomId: string,
  assignmentId: string,
  student: Principal,
  otherStudent: Principal,
  pairId: string;
beforeAll(async () => {
  await db.insert(t.users).values([owner, outsider]);
});
afterAll(async () => {
  await client.end();
});
describe.sequential(
  "Persistent pilot: security and evaluation lifecycle",
  () => {
    it("requires real authentication and rejects forged headers", async () => {
      const r = await handleRequest(
        new Request("http://localhost/api/dashboard", {
          headers: { "x-user-id": owner.id, "x-user-role": "OWNER" },
        }),
        null,
        service,
      );
      expect(r.status).toBe(401);
    });
    it("rejects cross-origin mutations", async () => {
      const r = await handleRequest(
        new Request("http://localhost/api/classrooms", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
        owner,
        service,
      );
      expect(r.status).toBe(403);
    });
    it("creates a room and keeps it invisible to non-members", async () => {
      classroomId = (
        await service.createClassroom(ctx(owner), {
          name: "Pilot",
          slug: "pilot",
          domains: ["example.edu"],
        })
      ).id;
      expect((await service.dashboard(ctx(outsider))).classrooms).toHaveLength(
        0,
      );
      await expect(
        service.roster(ctx(outsider), classroomId),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("imports CSV atomically and handles quoted names", async () => {
      const rows = Array.from(
        { length: 12 },
        (_, i) =>
          `s${i}-${suffix}@example.edu,Group ${Math.floor(i / 4)},"Student ${i}, Test"`,
      );
      await service.importRoster(
        ctx(owner),
        classroomId,
        `email,group_name,display_name\n${rows.join("\n")}`,
      );
      const roster = await service.roster(ctx(owner), classroomId);
      expect(roster.members.filter((m) => m.role === "STUDENT")).toHaveLength(
        12,
      );
      student = roster.members.find((m) => m.email.startsWith("s0-"))!;
      otherStudent = roster.members.find((m) => m.email.startsWith("s1-"))!;
      await expect(
        service.importRoster(
          ctx(owner),
          classroomId,
          "email,group_name\nwrong@outside.edu,New\nother@example.edu,New",
        ),
      ).rejects.toMatchObject({ code: "DOMAIN_NOT_ALLOWED" });
      expect(
        (await service.roster(ctx(owner), classroomId)).members,
      ).toHaveLength(13);
      for (const g of roster.groups)
        await service.updateArtifact(ctx(owner), classroomId, g.id, {
          artifactUrl: "https://example.edu/demo",
        });
    });
    it("creates and publishes with real persisted pairs", async () => {
      assignmentId = (
        await service.createAssignment(ctx(owner), {
          classroomId,
          name: "Final",
          opensAt: new Date(Date.now() - 60_000).toISOString(),
          closesAt: new Date(Date.now() + 86400_000).toISOString(),
          config: {},
          criteria: [
            { id: "g", side: "GROUP", name: "Quality", weightPct: 100 },
            { id: "i", side: "INDIVIDUAL", name: "Teamwork", weightPct: 100 },
          ],
        })
      ).id;
      await service.publish(ctx(owner), assignmentId, {
        acceptReducedCoverage: true,
      });
      const e = await service.evaluations(ctx(student), assignmentId, "GROUP");
      expect(e.comparisons.length).toBeGreaterThan(0);
      pairId = e.comparisons[0].pairAssignmentId;
      await expect(
        service.publish(ctx(owner), assignmentId, {
          acceptReducedCoverage: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("enforces pair ownership, role and roster locks", async () => {
      expect((await service.detail(ctx(student), assignmentId)).instructorGuide).toBeUndefined();
      expect((await service.detail(ctx(owner), assignmentId)).instructorGuide).toMatchObject({ needsEvaluators: 0, waitingForSubmissions: 12, suggestions: [] });
      await expect(
        service.save(ctx(otherStudent), pairId, {
          choice: 1,
          expectedVersion: 0,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.reports(ctx(student), assignmentId, "individual"),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.auditLog(ctx(student), assignmentId),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.importRoster(
          ctx(owner),
          classroomId,
          `email,group_name\na-${suffix}@example.edu,A\nb-${suffix}@example.edu,A`,
        ),
      ).rejects.toMatchObject({ code: "ROSTER_LOCKED" });
    });
    it("keeps drafts separate, handles retries and version conflicts", async () => {
      const first = await service.save(ctx(student), pairId, {
        choice: 1,
        expectedVersion: 0,
      });
      expect(first.version).toBe(1);
      expect(
        (
          await service.save(ctx(student), pairId, {
            choice: 1,
            expectedVersion: 0,
          })
        ).version,
      ).toBe(1);
      await expect(
        service.save(ctx(student), pairId, { choice: 6, expectedVersion: 0 }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      await expect(
        service.save(ctx(student), pairId, { choice: 1.5, expectedVersion: 1 }),
      ).rejects.toBeDefined();
      const response = await service.submit(
        ctx(student),
        assignmentId,
        { side: "GROUP" },
        "retry-0001",
      );
      expect(
        await service.submit(
          ctx(student),
          assignmentId,
          { side: "GROUP" },
          "retry-0001",
        ),
      ).toEqual(response);
      await expect(
        service.submit(
          ctx(student),
          assignmentId,
          { side: "INDIVIDUAL" },
          "retry-0001",
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
      await service.save(ctx(student), pairId, {
        choice: 6,
        expectedVersion: 1,
      });
      const [saved] = await db
        .select()
        .from(t.answers)
        .where(eq(t.answers.pairId, pairId));
      expect(saved.draftChoice).toBe(6);
      expect(saved.submittedChoice).toBe(1);
      await service.submit(
        ctx(student),
        assignmentId,
        { side: "GROUP" },
        "retry-0002",
      );
      expect(
        await db
          .select()
          .from(t.revisions)
          .where(eq(t.revisions.pairId, pairId)),
      ).toHaveLength(2);
    });
    it("allows staff evaluation but pseudonymizes report identities", async () => {
      const roster = await service.roster(ctx(owner), classroomId);
      await service.addMember(ctx(owner), classroomId, {
        email: `teacher-${suffix}@example.edu`,
        role: "CO_TEACHER",
      });
      const teacher = (
        await service.roster(ctx(owner), classroomId)
      ).members.find((m) => m.role === "CO_TEACHER")!;
      await expect(
        service.addMember(ctx(teacher), classroomId, {
          email: `bad-${suffix}@example.edu`,
          role: "TA",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.assignInstructor(ctx(student), assignmentId, {
          criterionId: "g",
          itemAId: roster.groups[0].id,
          itemBId: roster.groups[1].id,
        }),
      ).rejects.toMatchObject({ status: 403 });
      for (let i = 0; i < roster.groups.length; i++)
        for (let j = i + 1; j < roster.groups.length; j++) {
          await service.assignInstructor(ctx(owner), assignmentId, {
            criterionId: "g",
            itemAId: roster.groups[i].id,
            itemBId: roster.groups[j].id,
          });
        }
      const groupStudents = roster.members.filter(
        (m) => m.role === "STUDENT" && m.groupId === student.groupId,
      );
      for (let i = 0; i < groupStudents.length; i++)
        for (let j = i + 1; j < groupStudents.length; j++) {
          await service.assignInstructor(ctx(owner), assignmentId, {
            criterionId: "i",
            itemAId: groupStudents[i].id,
            itemBId: groupStudents[j].id,
          });
        }
      for (const side of ["GROUP", "INDIVIDUAL"] as const) {
        const evaluation = await service.evaluations(
          ctx(owner),
          assignmentId,
          side,
        );
        for (const pair of evaluation.comparisons)
          await service.save(ctx(owner), pair.pairAssignmentId, {
            choice: 1,
            expectedVersion: 0,
          });
        await service.submit(
          ctx(owner),
          assignmentId,
          { side },
          `staff-${side}`,
        );
      }
      const quality = await service.reports(
        ctx(teacher),
        assignmentId,
        "quality",
      );
      expect(JSON.stringify(quality)).toContain("EVAL-");
      expect(JSON.stringify(quality)).not.toContain(owner.id);
      await expect(
        service.auditLog(ctx(teacher), assignmentId),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.export(ctx(teacher), assignmentId, {
          report: "raw",
          includeIdentities: true,
          reason: "Review",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        service.finalize(ctx(teacher), assignmentId, { reason: "Review" }),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("hides individual and inferable total scores when anonymity is insufficient", async () => {
      const score = await service.myScore(ctx(student), assignmentId);
      expect(score.individualScore).toBeUndefined();
      expect(score.finalPersonalScore).toBeUndefined();
      expect(JSON.stringify(score)).not.toContain("evaluator");
      expect(score.participationRatio).toBeGreaterThan(0);
      expect(score.participationRatio).toBeLessThan(1);
    });
    it("serializes conflicting autosaves without losing a write silently", async () => {
      const results = await Promise.allSettled([
        service.save(ctx(student), pairId, { choice: 2, expectedVersion: 2 }),
        service.save(ctx(student), pairId, { choice: 3, expectedVersion: 2 }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });
    it("closes and snapshots final scores; further submissions cannot change them", async () => {
      await expect(
        service.finalize(ctx(owner), assignmentId, { reason: "Checked" }),
      ).rejects.toMatchObject({ status: 409 });
      await service.close(ctx(owner), assignmentId, { reason: "End of pilot" });
      await service.finalize(ctx(owner), assignmentId, {
        reason: "Reviewed low confidence records",
      });
      await expect(
        service.submit(
          ctx(student),
          assignmentId,
          { side: "GROUP" },
          "after-close",
        ),
      ).rejects.toMatchObject({ status: 409 });
      const [a] = await db
        .select()
        .from(t.assignments)
        .where(eq(t.assignments.id, assignmentId));
      expect(a.snapshot?.students).toHaveLength(12);
      expect(a.snapshot?.pairAssignments.length).toBeGreaterThan(0);
      expect(
        a.snapshot?.comparisons.some(
          (c) => c.evaluatorUserId === owner.id && c.isInstructor,
        ),
      ).toBe(true);
      await expect(
        db
          .update(t.assignments)
          .set({ snapshot: null })
          .where(eq(t.assignments.id, assignmentId)),
      ).rejects.toBeDefined();
      await expect(
        db
          .update(t.events)
          .set({ action: "TAMPERED" })
          .where(eq(t.events.assignmentId, assignmentId)),
      ).rejects.toBeDefined();
      const reconnect = connectDatabase(url!);
      try {
        expect(
          (
            await reconnect.db
              .select()
              .from(t.assignments)
              .where(eq(t.assignments.id, assignmentId))
          )[0].status,
        ).toBe("FINALIZED");
      } finally {
        await reconnect.client.end();
      }
    });
    it("requires reasons for overrides and scopes all exports", async () => {
      await expect(
        service.override(ctx(student), assignmentId, {
          studentId: student.id,
          value: 18,
          reason: "Try",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await service.override(ctx(owner), assignmentId, {
        studentId: student.id,
        value: 18,
        reason: "Reviewed individual contribution",
      });
      const csv = await service.export(ctx(owner), assignmentId, {
        report: "individual",
      });
      expect(csv).toContain('"18"');
      const raw = await service.export(ctx(owner), assignmentId, {
        report: "raw",
      });
      expect(raw).toContain("EVAL-");
      expect(raw).not.toContain(student.id);
      await expect(
        service.export(ctx(outsider), assignmentId, { report: "raw" }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.export(ctx(owner), assignmentId, {
          report: "raw",
          includeIdentities: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
    it("archives only for the owner with a matching name and an audit reason", async () => {
      const roster = await service.roster(ctx(owner), classroomId);
      for (const user of [student, roster.members.find((m) => m.role === "CO_TEACHER")!])
        await expect(service.archiveClassroom(ctx(user), classroomId, { name: "Pilot", reason: "End of term" })).rejects.toMatchObject({ status: 403 });
      await expect(service.archiveClassroom(ctx(outsider), classroomId, { name: "Pilot", reason: "End of term" })).rejects.toMatchObject({ status: 404 });
      await expect(service.archiveClassroom(ctx(owner), classroomId, { name: "Wrong", reason: "End of term" })).rejects.toMatchObject({ code: "NAME_MISMATCH" });
      await expect(service.archiveClassroom(ctx(owner), classroomId, { name: "Pilot", reason: " " })).rejects.toBeDefined();
      const before = (await db.select().from(t.assignments).where(eq(t.assignments.id, assignmentId)))[0];
      const csv = await service.export(ctx(owner), assignmentId, { report: "individual" });
      const archived = await service.archiveClassroom(ctx(owner), classroomId, { name: "Pilot", reason: "End of term" });
      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect((await service.dashboard(ctx(owner))).classrooms).toHaveLength(0);
      expect((await service.dashboard(ctx(owner))).archivedClassrooms.map((r) => r.classroom.id)).toContain(classroomId);
      expect((await service.dashboard(ctx(student))).archivedClassrooms.map((r) => r.classroom.id)).toContain(classroomId);
      expect((await service.dashboard(ctx(outsider))).archivedClassrooms).toHaveLength(0);
      expect((await service.detail(ctx(student), assignmentId)).classroomArchived).toBe(true);
      expect(await service.export(ctx(owner), assignmentId, { report: "individual" })).toBe(csv);
      expect((await db.select().from(t.assignments).where(eq(t.assignments.id, assignmentId)))[0]).toEqual(before);
      const events = await db.select().from(t.events).where(eq(t.events.classroomId, classroomId));
      const event = events.find((e) => e.action === "ARCHIVE_CLASSROOM");
      expect(event).toMatchObject({ actorId: owner.id, reason: "End of term", detail: { before: { archivedAt: null }, after: { archivedAt: archived.archivedAt.toISOString() } } });
    });
    it("returns only the current evaluator's progress, including after archival", async () => {
      const own = (await service.detail(ctx(student), assignmentId)).myProgress;
      const comparisons = (await service.evaluations(ctx(student), assignmentId, "GROUP")).comparisons;
      expect(own.GROUP.total).toBe(comparisons.length);
      expect(own.GROUP.answered).toBeGreaterThan(0);
      expect((await service.detail(ctx(otherStudent), assignmentId)).myProgress.GROUP.answered).toBe(0);
      expect((await service.dashboard(ctx(student))).assignments.find((a) => a.id === assignmentId)?.myProgress).toEqual(own);
      expect(JSON.stringify(own)).not.toContain(student.id);
      await expect(service.detail(ctx(outsider), assignmentId)).rejects.toMatchObject({ status: 404 });
    });
    it("rejects all later writes while preserving scoped read access", async () => {
      const group = (await service.roster(ctx(owner), classroomId)).groups[0];
      const mutations = [
        () => service.archiveClassroom(ctx(owner), classroomId, { name: "Pilot", reason: "Again" }),
        () => service.updateArtifact(ctx(owner), classroomId, group.id, { artifactUrl: "https://example.edu/changed" }),
        () => service.addMember(ctx(owner), classroomId, { email: `late-${suffix}@example.edu`, role: "TA" }),
        () => service.importRoster(ctx(owner), classroomId, `email,group_name\na-${suffix}@example.edu,New\nb-${suffix}@example.edu,New`),
        () => service.save(ctx(student), pairId, { choice: 2, expectedVersion: 3 }),
        () => service.submit(ctx(student), assignmentId, { side: "GROUP" }, "after-archive"),
        () => service.close(ctx(owner), assignmentId, { reason: "After archive" }),
        () => service.finalize(ctx(owner), assignmentId, { reason: "After archive" }),
        () => service.override(ctx(owner), assignmentId, { studentId: student.id, value: 19, reason: "After archive" }),
      ];
      for (const mutate of mutations) await expect(mutate()).rejects.toMatchObject({ code: "CLASSROOM_ARCHIVED", status: 409 });
      expect((await service.myScore(ctx(student), assignmentId)).label).toBeDefined();
      await expect(service.detail(ctx(outsider), assignmentId)).rejects.toMatchObject({ status: 404 });
    });
  },
);
