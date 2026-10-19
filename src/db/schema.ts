import {
  pgTable,
  pgSchema,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AssignmentConfig,
  CriterionInput,
  Snapshot,
} from "../domain/model";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  googleSubject: text("google_subject").unique(),
  noticeAcceptedAt: timestamp("notice_accepted_at", { withTimezone: true }),
});
export const classrooms = pgTable("classrooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  domains: jsonb("domains").$type<string[]>().notNull(),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id")
    .notNull()
    .references(() => classrooms.id),
  name: text("name").notNull(),
  artifactUrl: text("artifact_url").notNull().default(""),
});
export const members = pgTable(
  "members",
  {
    id: text("id").primaryKey(),
    classroomId: text("classroom_id")
      .notNull()
      .references(() => classrooms.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    groupId: text("group_id").references(() => groups.id),
  },
  (t) => [uniqueIndex("member_class_user").on(t.classroomId, t.userId)],
);
export const assignments = pgTable("assignments", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id")
    .notNull()
    .references(() => classrooms.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("DRAFT"),
  config: jsonb("config").$type<AssignmentConfig>().notNull(),
  criteria: jsonb("criteria").$type<CriterionInput[]>().notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  seed: text("seed").notNull(),
  generation: integer("generation").notNull().default(1),
  snapshot: jsonb("snapshot").$type<Snapshot>(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});
export const pairs = pgTable(
  "pairs",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id),
    criterionId: text("criterion_id").notNull(),
    side: text("side").notNull(),
    evaluatorId: text("evaluator_id")
      .notNull()
      .references(() => users.id),
    itemAId: text("item_a_id").notNull(),
    itemBId: text("item_b_id").notNull(),
    leftId: text("left_id").notNull(),
    generation: integer("generation").notNull(),
  },
  (t) => [
    uniqueIndex("pair_once").on(
      t.assignmentId,
      t.criterionId,
      t.evaluatorId,
      t.itemAId,
      t.itemBId,
      t.generation,
    ),
  ],
);
export const answers = pgTable("answers", {
  pairId: text("pair_id")
    .primaryKey()
    .references(() => pairs.id),
  draftChoice: integer("draft_choice").notNull(),
  version: integer("version").notNull(),
  submittedChoice: integer("submitted_choice"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  timeOnTaskMs: integer("time_on_task_ms").notNull().default(0),
});
export const revisions = pgTable("revisions", {
  id: text("id").primaryKey(),
  pairId: text("pair_id")
    .notNull()
    .references(() => pairs.id),
  choice: integer("choice").notNull(),
  version: integer("version").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").notNull(),
  },
  (t) => [uniqueIndex("submission_retry").on(t.assignmentId, t.userId, t.key)],
);
export const scores = pgTable("scores", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => assignments.id),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id),
  value: numeric("value", { precision: 14, scale: 8 }).notNull(),
});
export const overrides = pgTable("overrides", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => assignments.id),
  studentId: text("student_id")
    .notNull()
    .references(() => users.id),
  value: numeric("value", { precision: 14, scale: 8 }).notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const auditSchema = pgSchema("audit");
export const events = auditSchema.table("events", {
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull(),
  actorId: text("actor_id").notNull(),
  assignmentId: text("assignment_id"),
  action: text("action").notNull(),
  reason: text("reason"),
  detail: jsonb("detail"),
  requestId: text("request_id").notNull(),
  ip: text("ip"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
