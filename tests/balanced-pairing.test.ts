import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  balancedGroupPairs,
  balancedIndividualPairs,
} from "../src/domain/pairing";
import type { Group, Student } from "../src/core/types";
function classroom(sizes: number[]) {
  const students: Student[] = [],
    groups: Group[] = [];
  sizes.forEach((size, i) => {
    const group: Group = { id: `g${i}`, name: `Group ${i}`, memberIds: [] };
    for (let j = 0; j < size; j++) {
      const id = `s${i}-${j}`;
      group.memberIds.push(id);
      students.push({
        id,
        email: `${id}@example.edu`,
        displayName: id,
        groupId: group.id,
      });
    }
    groups.push(group);
  });
  return { groups, students };
}
describe("Balanced allocation with unequal group sizes", () => {
  it("enforces all five invariants including zero-workload evaluators", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 2, max: 8 }), {
          minLength: 3,
          maxLength: 8,
        }),
        fc.integer({ min: 1, max: 9999 }),
        (sizes, seed) => {
          const data = classroom(sizes),
            params = {
              ...data,
              assignmentId: "a",
              criterionId: "c",
              seed: String(seed),
              targetCoverage: 5,
              maxWorkload: 8,
              generation: 1,
            };
          const result = balancedGroupPairs(params),
            coverage: number[] = [];
          for (let i = 0; i < data.groups.length; i++)
            for (let j = i + 1; j < data.groups.length; j++)
              coverage.push(
                result.pairAssignments.filter(
                  (p) =>
                    p.itemAId === data.groups[i].id &&
                    p.itemBId === data.groups[j].id,
                ).length,
              );
          expect(
            Math.max(...coverage) - Math.min(...coverage),
          ).toBeLessThanOrEqual(1);
          const workload = data.students.map(
            (s) =>
              result.pairAssignments.filter((p) => p.evaluatorUserId === s.id)
                .length,
          );
          expect(
            Math.max(...workload) - Math.min(...workload),
          ).toBeLessThanOrEqual(1);
          expect(Math.max(...workload)).toBeLessThanOrEqual(8);
          const seen = new Set<string>();
          for (const p of result.pairAssignments) {
            const s = data.students.find((s) => s.id === p.evaluatorUserId)!;
            expect([p.itemAId, p.itemBId]).not.toContain(s.groupId);
            const key = `${p.evaluatorUserId}:${p.itemAId}:${p.itemBId}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
          expect(balancedGroupPairs(params)).toEqual(result);
        },
      ),
      { numRuns: 80, seed: 20261015 },
    );
  });
  it("reports achieved individual coverage when workload is capped", () => {
    const group = classroom([8]).groups[0];
    const result = balancedIndividualPairs({
      assignmentId: "a",
      criterionId: "c",
      group,
      seed: "test",
      maxWorkload: 8,
      generation: 1,
    });
    expect(result.coverage).toBeLessThan(6);
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++)
        expect(
          result.pairAssignments.filter(
            (p) =>
              p.itemAId === group.memberIds[i] &&
              p.itemBId === group.memberIds[j],
          ).length,
        ).toBe(result.coverage);
  });
});
