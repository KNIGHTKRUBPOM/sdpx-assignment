import { describe, it, expect } from "vitest";
import { instructorGuide } from "../src/domain/instructor-guide";
const students = ["a", "b", "c"].map(id => ({ id, name: id, groupName: "G" }));
const criteria = [{ id: "i", name: "Teamwork" }];
const rows = students.map((s, i) => ({ criterionId: "i", evaluatorId: s.id, itemAId: students[(i + 1) % 3].id, itemBId: students[(i + 2) % 3].id, submittedChoice: 3 as number | null }));
describe("instructor next steps", () => {
  it("separates missing evaluators from pending submissions and never assigns answers", () => {
    expect(instructorGuide(rows, students, criteria, "teacher")).toMatchObject({ needsEvaluators: 3, waitingForSubmissions: 0 });
    const teacherPair = { criterionId: "i", itemAId: "a", itemBId: "b", evaluatorId: "teacher", submittedChoice: null };
    const assigned = instructorGuide([...rows, teacherPair], students, criteria, "teacher");
    expect(assigned).toMatchObject({ needsEvaluators: 1, waitingForSubmissions: 2 });
    expect(assigned.suggestions.every(p => [p.itemAId, p.itemBId].includes("c"))).toBe(true);
    expect(instructorGuide([...rows, { ...teacherPair, submittedChoice: 2 }], students, criteria, "teacher")).toMatchObject({ needsEvaluators: 1, waitingForSubmissions: 0 });
  });
  it("counts distinct people across criteria and avoids duplicate teacher work", () => {
    const pending = [...rows, ...rows.map(r => ({ ...r, criterionId: "other" }))];
    expect(instructorGuide(pending, students, criteria, "teacher").needsEvaluators).toBe(3);
    const sufficient = [...rows, ...rows.map(r => ({ ...r, evaluatorId: "teacher", submittedChoice: null }))];
    expect(instructorGuide(sufficient, students, criteria, "teacher")).toEqual({ needsEvaluators: 0, waitingForSubmissions: 3, suggestions: [] });
    expect(instructorGuide(sufficient.map(r => ({ ...r, submittedChoice: 3 })), students, criteria, "teacher")).toEqual({ needsEvaluators: 0, waitingForSubmissions: 0, suggestions: [] });
  });
});
