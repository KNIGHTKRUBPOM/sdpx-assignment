import { afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { PairEvalService } from "../../src/domain/service";
import type { Principal } from "../../src/domain/model";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Requires an isolated _test database");
const { db, client } = connectDatabase(url);
afterAll(() => client.end());

it("disables individual pairs through publish and instructor assignment, then submits, exports and finalizes group-only scores", async () => {
  const suffix = crypto.randomUUID();
  const owner = { id: crypto.randomUUID(), email: `owner-${suffix}@example.edu`, name: "Owner" };
  await db.insert(t.users).values(owner);
  const service = new PairEvalService(db, [owner.email], "test-export-secret");
  const ctx = (user: Principal) => ({ user, requestId: crypto.randomUUID() });
  const room = await service.createClassroom(ctx(owner), { name: "Group only", slug: "group-only", domains: ["example.edu"] });
  await service.importRoster(ctx(owner), room.id, `email,group_name\n${Array.from({ length: 12 }, (_, i) => `zero${i}-${suffix}@example.edu,G${Math.floor(i / 4)}`).join("\n")}`);
  const roster = await service.roster(ctx(owner), room.id);
  for (const g of roster.groups) await service.updateArtifact(ctx(owner), room.id, g.id, { artifactUrl: "https://example.edu/project" });
  const assignment = await service.createAssignment(ctx(owner), {
    classroomId: room.id, name: "Group only", opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 3600000).toISOString(),
    config: { individualMaxScore: 0 }, criteria: [
      { id: "g", side: "GROUP", name: "Quality", weightPct: 100 },
      { id: "i", side: "INDIVIDUAL", name: "Ignored even when supplied through API", weightPct: 100 },
    ],
  });
  await service.publish(ctx(owner), assignment.id, { acceptReducedCoverage: true });
  const pairs = await db.select().from(t.pairs).where(eq(t.pairs.assignmentId, assignment.id));
  expect(pairs.length).toBeGreaterThan(0);
  expect(pairs.every(p => p.side === "GROUP")).toBe(true);
  const students = roster.members.filter(m => m.role === "STUDENT");
  const classmates = students.filter(s => s.groupId === students[0].groupId);
  await expect(service.assignInstructor(ctx(owner), assignment.id, { criterionId: "i", itemAId: classmates[0].id, itemBId: classmates[1].id }))
    .rejects.toMatchObject({ code: "INDIVIDUAL_DISABLED", status: 409 });
  expect((await service.detail(ctx(owner), assignment.id)).instructorGuide).toBeUndefined();
  for (const student of students) {
    expect((await service.evaluations(ctx(student), assignment.id, "INDIVIDUAL")).comparisons).toEqual([]);
    const evaluation = await service.evaluations(ctx(student), assignment.id, "GROUP");
    for (const p of evaluation.comparisons) await service.save(ctx(student), p.pairAssignmentId, { choice: 3, expectedVersion: 0 });
    await service.submit(ctx(student), assignment.id, { side: "GROUP" }, crypto.randomUUID());
    const progress = (await service.detail(ctx(student), assignment.id)).myProgress;
    expect(progress.GROUP.outstanding).toBe(0);
    expect(progress.INDIVIDUAL.total).toBe(0);
    const score = await service.myScore(ctx(student), assignment.id);
    expect(score.individualScore).toBe(0);
    expect(score.multiplier).toBe(1);
    expect(score.finalPersonalScore).toBe(score.groupScore);
  }
  await service.close(ctx(owner), assignment.id, { reason: "Complete group-only test" });
  await service.finalize(ctx(owner), assignment.id, { reason: "Verified group-only scores" });
  const report = await service.reports(ctx(owner), assignment.id, "individual") as { individual: { totalComponentScore: number; flags: string[] } }[];
  expect(report).toHaveLength(12);
  expect(report.every(s => s.individual.totalComponentScore === 0 && !s.individual.flags.length)).toBe(true);
  expect((await service.myScore(ctx(students[0]), assignment.id)).label).toBe("คะแนนสุดท้าย");
  const csv = await service.export(ctx(owner), assignment.id, { report: "individual" });
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("individual_score");
});
