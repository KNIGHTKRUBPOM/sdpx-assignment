import { describe, it, expect } from "vitest";
import { scoreItem, type ScopedComparison } from "../src/domain/scoring";
import { configSchema, type CriterionInput } from "../src/domain/model";
import { allowedDomain, assertOpen, safeEmail } from "../src/domain/policy";
import {
  buildStudentSelfScoreView,
  exportToCsvString,
} from "../src/core/reports/reports";
import { computeFinalPersonalScore } from "../src/core/scoring/scoring-engine";

const config = configSchema.parse({});
function comparison(
  criterionId: string,
  choice: 1 | 6,
  assignmentId = "assignment",
): ScopedComparison {
  return {
    id: crypto.randomUUID(),
    assignmentId,
    criterionId,
    pairAssignmentId: "pair",
    evaluatorUserId: "evaluator",
    isInstructor: false,
    itemLeftId: "item",
    itemRightId: "other",
    choice,
    status: "SUBMITTED",
  };
}
describe("Pilot scoring regression and policy", () => {
  it("separates criteria and assignments even when item IDs are the same", () => {
    const criteria: CriterionInput[] = [
      { id: "quality", side: "GROUP", name: "Quality", weightPct: 50 },
      { id: "ux", side: "GROUP", name: "UX", weightPct: 50 },
    ];
    const result = scoreItem(
      "assignment",
      "item",
      "GROUP",
      criteria,
      [
        comparison("quality", 1),
        comparison("ux", 6),
        comparison("quality", 6, "other-assignment"),
      ],
      config,
    );
    expect(result.criterionScores.quality.qualityIndex).toBe(1);
    expect(result.criterionScores.ux.qualityIndex).toBe(0);
    expect(result.totalComponentScore).toBe(12);
  });
  it("computes the PRD example through the actual engine from comparisons", () => {
    const cases = [
      ["ux", 72, 40, "GROUP"],
      ["completeness", 55, 35, "GROUP"],
      ["innovation", 61, 25, "GROUP"],
      ["teamwork", 68, 50, "INDIVIDUAL"],
      ["management", 45, 50, "INDIVIDUAL"],
    ] as const;
    const criteria: CriterionInput[] = cases.map(([id, , weightPct, side]) => ({
      id,
      name: id,
      weightPct,
      side,
    }));
    const all = cases.flatMap(([id, q]) =>
      Array.from({ length: 100 }, (_, i) => comparison(id, i < q ? 1 : 6)),
    );
    const group = scoreItem(
        "assignment",
        "item",
        "GROUP",
        criteria,
        all,
        config,
      ),
      individual = scoreItem(
        "assignment",
        "item",
        "INDIVIDUAL",
        criteria,
        all,
        config,
      );
    expect(group.totalComponentScore).toBe(12.798);
    expect(individual.totalComponentScore).toBe(4.13);
    const personal = computeFinalPersonalScore({
      studentId: "item",
      groupId: "group",
      groupComponentScore: group.totalComponentScore,
      individualComponentScore: individual.totalComponentScore,
      assignedGroupComparisons: 12,
      submittedGroupComparisons: 12,
      assignedIndividualComparisons: 3,
      submittedIndividualComparisons: 3,
    });
    expect(personal.finalPersonalScore.toFixed(2)).toBe("16.93");
    const hidden = buildStudentSelfScoreView({
      studentId: "item",
      groupSummary: group,
      personalResult: personal,
      individualSubmittedEvaluatorsCount: 2,
      isFinal: true,
    });
    expect(hidden.individualScore).toBeUndefined();
    expect(hidden.finalPersonalScore).toBeUndefined();
  });
  it("does not let drafts alter score or invent confidence", () => {
    const c = { ...comparison("quality", 1), status: "DRAFT" as const };
    const result = scoreItem(
      "assignment",
      "item",
      "GROUP",
      [{ id: "quality", name: "Quality", side: "GROUP", weightPct: 100 }],
      [c],
      config,
    );
    expect(result.criterionScores.quality.comparisonCount).toBe(0);
    expect(result.flags).toContain("LOW_CONFIDENCE");
  });
  it("preserves university local parts and canonicalizes Gmail aliases", () => {
    expect(safeEmail(" A.B+tag@uni.ac.th ")).toBe("a.b+tag@uni.ac.th");
    expect(safeEmail(" A.B+tag@googlemail.com ")).toBe("ab@gmail.com");
    expect(allowedDomain("a@eviluni.ac.th", ["uni.ac.th"])).toBe(false);
  });
  it("rejects saves at the exact deadline and before opening", () => {
    const a = {
      status: "PUBLISHED",
      opensAt: new Date("2026-01-01"),
      closesAt: new Date("2026-01-02"),
    };
    expect(() => assertOpen(a, new Date("2026-01-02"))).toThrow();
    expect(() => assertOpen(a, new Date("2025-12-31"))).toThrow();
    expect(() => assertOpen(a, new Date("2026-01-01T12:00:00Z"))).not.toThrow();
  });
  it("quotes embedded CSV delimiters and guards spreadsheet formulas", () => {
    const csv = exportToCsvString(
      ["name"],
      [['a,"b"'], [' =HYPERLINK("evil")']],
    );
    expect(csv).toContain('"a,""b"""');
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
  });
});
