import { z } from "zod";
import type {
  ItemScoreSummary,
  PersonalScoreResult,
  SubmittedComparison,
  PairAssignment,
} from "../core/types";

export const sideSchema = z.enum(["GROUP", "INDIVIDUAL"]);
export const roleSchema = z.enum(["OWNER", "CO_TEACHER", "TA", "STUDENT"]);
export type Role = z.infer<typeof roleSchema>;
export const configSchema = z
  .object({
    floor: z.number().min(0).max(1).default(0.6),
    ceiling: z.number().min(0).max(1).default(1),
    instructorWeight: z.number().min(0).max(10).default(1),
    minComparisons: z.number().int().min(1).max(20).default(3),
    completionThreshold: z.number().min(0.01).max(1).default(0.9),
    groupMaxScore: z.number().positive().max(100).default(15),
    individualMaxScore: z.number().min(0).max(100).default(5),
    targetCoverage: z.number().int().min(1).max(20).default(5),
    maxWorkload: z.number().int().min(1).max(30).default(8),
  })
  .refine((v) => v.floor < v.ceiling, "floor ต้องน้อยกว่า ceiling");
export type AssignmentConfig = z.infer<typeof configSchema>;
export const criterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  side: sideSchema,
  weightPct: z.number().positive().max(100),
});
export type CriterionInput = z.infer<typeof criterionSchema>;
export const assignmentSchema = z
  .object({
    classroomId: z.string().min(1),
    name: z.string().trim().min(1).max(150),
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
    config: configSchema,
    criteria: z.array(criterionSchema).min(1).max(10),
  })
  .superRefine((v, ctx) => {
    if (new Date(v.opensAt) >= new Date(v.closesAt))
      ctx.addIssue({ code: "custom", message: "วันปิดต้องหลังวันเปิด" });
    if (new Set(v.criteria.map((c) => c.id)).size !== v.criteria.length)
      ctx.addIssue({ code: "custom", message: "รหัสเกณฑ์ซ้ำ" });
    for (const side of ["GROUP", "INDIVIDUAL"] as const) {
      if (side === "INDIVIDUAL" && v.config.individualMaxScore === 0) continue;
      if (
        Math.abs(
          v.criteria
            .filter((c) => c.side === side)
            .reduce((s, c) => s + c.weightPct, 0) - 100,
        ) > 0.001
      )
        ctx.addIssue({
          code: "custom",
          message: `น้ำหนัก ${side} ต้องรวม 100%`,
        });
    }
  });
export interface Principal {
  id: string;
  email: string;
  name: string;
}
export interface Context {
  user: Principal;
  requestId: string;
  ip?: string;
}
export interface StudentScore {
  studentId: string;
  name: string;
  groupId: string;
  group: ItemScoreSummary;
  individual: ItemScoreSummary;
  personal: PersonalScoreResult;
  evaluatorCount: number;
}
export interface Snapshot {
  formulaVersion: string;
  computedAt: string;
  config: AssignmentConfig;
  criteria: CriterionInput[];
  comparisons: SubmittedComparison[];
  pairAssignments: PairAssignment[];
  students: StudentScore[];
  groups: ItemScoreSummary[];
}
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireRule(
  ok: unknown,
  code: string,
  message: string,
  status = 400,
): asserts ok {
  if (!ok) throw new AppError(status, code, message);
}
