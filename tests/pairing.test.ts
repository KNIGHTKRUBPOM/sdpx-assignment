import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  generateGroupPairs,
  generateIndividualPairs,
  solveGroupFeasibility,
} from '../src/core/pairing/pairing-engine.js';
import { Group, Student } from '../src/core/types.js';

describe('Pairing Engine', () => {
  describe('Group Evaluation Feasibility (PRD §8.2)', () => {
    it('handles Example 1 — Large class (feasible): S=200, N=10, R=5 => k=2', () => {
      const groups: Group[] = Array.from({ length: 10 }, (_, i) => ({
        id: `g${i + 1}`,
        name: `Group ${i + 1}`,
        memberIds: Array.from({ length: 20 }, (__, j) => `s_${i}_${j}`),
      }));

      const res = solveGroupFeasibility({
        totalStudents: 200,
        groups,
        targetCoverage: 5,
        maxWorkload: 8,
      });

      expect(res.feasible).toBe(true);
      expect(res.achievableCoverage).toBe(5);
      expect(res.workloadPerEvaluator).toBe(2);
      expect(res.totalComparisons).toBe(225); // P=45 * 5 = 225
      expect(res.constraintViolations).toHaveLength(0);
    });

    it('handles Example 2 — Small class (infeasible, auto-reduces R): S=12, N=3, R=5 => R=4, k=1', () => {
      const groups: Group[] = Array.from({ length: 3 }, (_, i) => ({
        id: `g${i + 1}`,
        name: `Group ${i + 1}`,
        memberIds: Array.from({ length: 4 }, (__, j) => `s_${i}_${j}`),
      }));

      const res = solveGroupFeasibility({
        totalStudents: 12,
        groups,
        targetCoverage: 5,
        maxWorkload: 8,
      });

      // Constraint 1 fails for R=5 because max eligible per person is 1
      // Reduced to R=4, k=1
      expect(res.feasible).toBe(false); // target 5 was not directly feasible
      expect(res.achievableCoverage).toBe(4);
      expect(res.workloadPerEvaluator).toBe(1);
      expect(res.totalComparisons).toBe(12); // P=3 * 4 = 12
      expect(res.message).toContain('ลด');
    });
  });

  describe('Individual Evaluation Complete Enumeration (PRD §8.3)', () => {
    it('rejects group sizes <= 2 (FR-PAIR-12)', () => {
      const group: Group = {
        id: 'g_duo',
        name: 'Duo',
        memberIds: ['alice', 'bob'],
      };

      expect(() =>
        generateIndividualPairs({
          assignmentId: 'a1',
          criterionId: 'c1',
          group,
          seed: 42,
        }),
      ).toThrowError(/Cannot perform individual evaluation/);
    });

    it('flags LOW_CONFIDENCE for group size m=3 (FR-PAIR-13)', () => {
      const group: Group = {
        id: 'g_trio',
        name: 'Trio',
        memberIds: ['alice', 'bob', 'charlie'],
      };

      const res = generateIndividualPairs({
        assignmentId: 'a1',
        criterionId: 'c1',
        group,
        seed: 42,
      });

      expect(res.isLowConfidence).toBe(true);
      expect(res.coverage).toBe(1); // m - 2 = 1
      expect(res.pairAssignments).toHaveLength(3); // each member evaluates 1 pair
    });

    it('generates complete enumeration for group size m=5 (recommended)', () => {
      const members = ['m1', 'm2', 'm3', 'm4', 'm5'];
      const group: Group = {
        id: 'g5',
        name: 'Quintet',
        memberIds: members,
      };

      const res = generateIndividualPairs({
        assignmentId: 'a1',
        criterionId: 'c1',
        group,
        seed: 12345,
      });

      // For m=5:
      // total pairs in group = C(5,2) = 10
      // pairs per member = C(4,2) = 6
      // coverage per pair = m - 2 = 3
      // Total assignments = 5 * 6 = 30
      expect(res.coverage).toBe(3);
      expect(res.workloadPerMember).toBe(6);
      expect(res.pairAssignments).toHaveLength(30);

      // Verify no member evaluates themselves (INV-1)
      for (const pa of res.pairAssignments) {
        expect(pa.itemAId).not.toBe(pa.evaluatorUserId);
        expect(pa.itemBId).not.toBe(pa.evaluatorUserId);
      }
    });
  });

  describe('Property-Based Invariants (PRD §8.4 Invariants INV-1 to INV-5)', () => {
    it('satisfies INV-1, INV-2, INV-3, INV-4, and INV-5 across randomized class configurations', () => {
      // Generate randomized classes with 3 to 8 groups, each group having 3 to 6 members
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 8 }),
          fc.integer({ min: 3, max: 6 }),
          fc.integer({ min: 1, max: 100000 }),
          (numGroups, membersPerGroup, seed) => {
            const groups: Group[] = [];
            const students: Student[] = [];

            for (let g = 0; g < numGroups; g++) {
              const groupId = `grp_${g}`;
              const memberIds: string[] = [];
              for (let m = 0; m < membersPerGroup; m++) {
                const studentId = `s_${g}_${m}`;
                memberIds.push(studentId);
                students.push({
                  id: studentId,
                  email: `${studentId}@example.com`,
                  displayName: `Student ${g}-${m}`,
                  groupId,
                });
              }
              groups.push({
                id: groupId,
                name: `Group ${g}`,
                memberIds,
              });
            }

            const res1 = generateGroupPairs({
              assignmentId: 'asg_prop',
              criterionId: 'crit_prop',
              students,
              groups,
              seed,
              targetCoverage: 5,
              maxWorkload: 8,
            });

            const assignments = res1.pairAssignments;

            // INV-1: No evaluator receives pair containing their own group
            for (const pa of assignments) {
              const evaluator = students.find((s) => s.id === pa.evaluatorUserId)!;
              expect(pa.itemAId).not.toBe(evaluator.groupId);
              expect(pa.itemBId).not.toBe(evaluator.groupId);
            }

            // INV-2: No evaluator receives duplicate pair within same criterion
            const evaluatorPairs = new Map<string, Set<string>>();
            for (const pa of assignments) {
              const set = evaluatorPairs.get(pa.evaluatorUserId) ?? new Set();
              const key =
                pa.itemAId < pa.itemBId
                  ? `${pa.itemAId}:${pa.itemBId}`
                  : `${pa.itemBId}:${pa.itemAId}`;
              expect(set.has(key)).toBe(false);
              set.add(key);
              evaluatorPairs.set(pa.evaluatorUserId, set);
            }

            // INV-3: Balanced coverage: max(coverage) - min(coverage) <= 1
            const pairCoverage = new Map<string, number>();
            for (const pa of assignments) {
              const key =
                pa.itemAId < pa.itemBId
                  ? `${pa.itemAId}:${pa.itemBId}`
                  : `${pa.itemBId}:${pa.itemAId}`;
              pairCoverage.set(key, (pairCoverage.get(key) ?? 0) + 1);
            }
            const coverages = Array.from(pairCoverage.values());
            if (coverages.length > 0) {
              const minCov = Math.min(...coverages);
              const maxCov = Math.max(...coverages);
              expect(maxCov - minCov).toBeLessThanOrEqual(1);
            }

            // INV-4: Evaluator workload difference <= 1
            const workloads = Array.from(evaluatorPairs.values()).map(
              (s) => s.size,
            );
            if (workloads.length > 0) {
              const minW = Math.min(...workloads);
              const maxW = Math.max(...workloads);
              expect(maxW - minW).toBeLessThanOrEqual(1);
            }

            // INV-5: Deterministic: identical seed + identical input => identical output
            const res2 = generateGroupPairs({
              assignmentId: 'asg_prop',
              criterionId: 'crit_prop',
              students,
              groups,
              seed,
              targetCoverage: 5,
              maxWorkload: 8,
            });

            expect(res1.pairAssignments).toEqual(res2.pairAssignments);
          },
        ),
        { numRuns: 25 },
      );
    });
  });
});
