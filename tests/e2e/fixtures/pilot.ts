import { test as base } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { connectDatabase } from "../../../src/db/client";
import { users } from "../../../src/db/schema";
import { PairEvalService } from "../../../src/domain/service";
import type { Context, Principal } from "../../../src/domain/model";

interface Pilot {
  assignmentId: string;
  classroomId: string;
  owner: Principal;
  student: Principal;
  service: PairEvalService;
  context: (user: Principal) => Context;
  login: (user: Principal) => Promise<void>;
}
export const test = base.extend<{ pilot: Pilot }>({
  pilot: async ({ context }, use) => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("E2E requires a disposable _test database");
    const { db, client } = connectDatabase(url),
      suffix = crypto.randomUUID();
    try {
      const [owner] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: "owner@example.edu",
          name: "อาจารย์ · E2E",
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: "อาจารย์ · E2E" },
        })
        .returning();
      const service = new PairEvalService(db, [owner.email], "test-only"),
        ctx = (user: Principal): Context => ({
          user,
          requestId: crypto.randomUUID(),
        });
      const room = await service.createClassroom(ctx(owner), {
        name: "SDPX · Browser test",
        slug: "e2e",
        domains: ["example.edu"],
      });
      const rows = Array.from(
        { length: 12 },
        (_, i) =>
          `learner${i}-${suffix}@example.edu,${["Aurora", "Borealis", "Cygnus"][Math.floor(i / 4)]},นักศึกษา ${i + 1}`,
      );
      await service.importRoster(
        ctx(owner),
        room.id,
        `email,group_name,display_name\n${rows.join("\n")}`,
      );
      const roster = await service.roster(ctx(owner), room.id);
      const student = roster.members.find((m) =>
        m.email.startsWith("learner0-"),
      )!;
      for (const g of roster.groups)
        await service.updateArtifact(ctx(owner), room.id, g.id, {
          artifactUrl: "https://example.edu/artifact",
        });
      const assignment = await service.createAssignment(ctx(owner), {
        classroomId: room.id,
        name: "Final Project · Pairwise Evaluation",
        opensAt: new Date(Date.now() - 60000).toISOString(),
        closesAt: new Date(Date.now() + 86400000).toISOString(),
        config: {},
        criteria: [
          { id: "quality", name: "คุณภาพผลงาน", side: "GROUP", weightPct: 100 },
          {
            id: "teamwork",
            name: "การมีส่วนร่วมในทีม",
            side: "INDIVIDUAL",
            weightPct: 100,
          },
        ],
      });
      await service.publish(ctx(owner), assignment.id, {
        acceptReducedCoverage: true,
      });
      const login = async (user: Principal) => {
        // Test-only fixture signs a session in the isolated environment. No test auth route ships in the app.
        const token = await encode({
          token: { userId: user.id, email: user.email, name: user.name },
          secret: process.env.NEXTAUTH_SECRET!,
          maxAge: 3600,
        });
        await context.clearCookies();
        await context.addCookies([
          {
            name: "next-auth.session-token",
            value: token,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            secure: false,
          },
        ]);
      };
      await use({
        assignmentId: assignment.id,
        classroomId: room.id,
        owner,
        student,
        service,
        context: ctx,
        login,
      });
    } finally {
      await client.end();
    }
  },
});
export { expect } from "@playwright/test";
