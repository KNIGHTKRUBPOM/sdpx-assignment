import { randomUUID } from "node:crypto";
import { connectDatabase } from "../src/db/client";
import { users, classrooms } from "../src/db/schema";
import { demoAccounts, demoEnabled } from "../src/demo/config";
import { PairEvalService } from "../src/domain/service";
import type { Context, Principal } from "../src/domain/model";

if (!demoEnabled() || !process.env.NEXTAUTH_SECRET) throw new Error("Demo environment is required");
const { db, client } = connectDatabase(process.env.DATABASE_URL!);
try {
  if ((await db.select().from(users).limit(1)).length || (await db.select().from(classrooms).limit(1)).length)
    throw new Error("Demo seeding requires a fresh empty database; restart the demo runner");
  const [teacher] = await db.insert(users).values({
    id: randomUUID(), email: demoAccounts[0].email, name: demoAccounts[0].name,
  }).returning();
  const service = new PairEvalService(db, [teacher.email], process.env.NEXTAUTH_SECRET);
  const ctx = (user: Principal): Context => ({ user, requestId: randomUUID() });
  const room = await service.createClassroom(ctx(teacher), {
    name: "DEMO · ห้องเรียนทดลองประเมิน", slug: "paireval-demo", domains: ["demo.invalid"],
  });
  await service.importRoster(ctx(teacher), room.id,
    "email,group_name,display_name\n" + demoAccounts.slice(1).map((a) => `${a.email},${a.group},${a.name}`).join("\n"));
  const roster = await service.roster(ctx(teacher), room.id);
  for (const group of roster.groups)
    await service.updateArtifact(ctx(teacher), room.id, group.id, { artifactUrl: `https://example.com/?demo=${encodeURIComponent(group.name)}` });
  const assignment = await service.createAssignment(ctx(teacher), {
    classroomId: room.id, name: "DEMO · ประเมินผลงานและการมีส่วนร่วม",
    opensAt: new Date(Date.now() - 60_000).toISOString(), closesAt: new Date(Date.now() + 86_400_000).toISOString(),
    config: {}, criteria: [
      { id: "quality", name: "คุณภาพผลงาน", side: "GROUP", weightPct: 100 },
      { id: "teamwork", name: "การมีส่วนร่วม", side: "INDIVIDUAL", weightPct: 100 },
    ],
  });
  await service.publish(ctx(teacher), assignment.id, { acceptReducedCoverage: true });
  // Synthetic identities only; real participation and answers start empty.
  for (const person of roster.members) await service.acceptNotice(ctx(person));
  console.log("Demo ready: 1 teacher, 12 students, 3 groups, no submitted answers. Coverage reduced from 5 to 4 for this classroom (PRD §8.2).");
} finally { await client.end(); }
