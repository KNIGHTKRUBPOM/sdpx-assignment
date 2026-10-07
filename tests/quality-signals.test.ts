import { describe, expect, it } from 'vitest';
import {
  computeKendallsW,
  detectIntransitivity,
  detectLowCoverage,
  detectPositionBias,
  detectSpeedRuns,
  detectStraightLining,
} from '../src/core/quality-signals/quality-signals.js';
import { SubmittedComparison } from '../src/core/types.js';

describe('Quality Signals Engine (PRD §10)', () => {
  it('QS-01: detects low coverage items (< 3 comparisons)', () => {
    const comparisons: SubmittedComparison[] = [
      {
        id: 'c1',
        pairAssignmentId: 'p1',
        evaluatorUserId: 'u1',
        isInstructor: false,
        itemLeftId: 'groupA',
        itemRightId: 'groupB',
        choice: 1,
        status: 'SUBMITTED',
      },
    ];

    const lowCov = detectLowCoverage(['groupA', 'groupB', 'groupC'], comparisons, 3);
    // groupA has 1, groupB has 1, groupC has 0 -> all < 3
    expect(lowCov).toHaveLength(3);
    expect(lowCov.find((x) => x.itemId === 'groupC')?.count).toBe(0);
  });

  it('QS-02: detects straight-lining evaluators (> 80% same choice)', () => {
    const comparisons: SubmittedComparison[] = [
      { id: '1', pairAssignmentId: 'p1', evaluatorUserId: 'lazy_user', isInstructor: false, itemLeftId: 'a', itemRightId: 'b', choice: 3, status: 'SUBMITTED' },
      { id: '2', pairAssignmentId: 'p2', evaluatorUserId: 'lazy_user', isInstructor: false, itemLeftId: 'c', itemRightId: 'd', choice: 3, status: 'SUBMITTED' },
      { id: '3', pairAssignmentId: 'p3', evaluatorUserId: 'lazy_user', isInstructor: false, itemLeftId: 'e', itemRightId: 'f', choice: 3, status: 'SUBMITTED' },
      { id: '4', pairAssignmentId: 'p4', evaluatorUserId: 'lazy_user', isInstructor: false, itemLeftId: 'g', itemRightId: 'h', choice: 3, status: 'SUBMITTED' },
      { id: '5', pairAssignmentId: 'p5', evaluatorUserId: 'lazy_user', isInstructor: false, itemLeftId: 'i', itemRightId: 'j', choice: 1, status: 'SUBMITTED' },
    ];

    const flags = detectStraightLining(comparisons, 0.75, 4);
    expect(flags).toHaveLength(1);
    expect(flags[0].evaluatorId).toBe('lazy_user');
    expect(flags[0].dominantChoice).toBe(3);
    expect(flags[0].ratio).toBe(4 / 5);
  });

  it('QS-03: detects position bias (> 80% on same side)', () => {
    const comparisons: SubmittedComparison[] = [
      { id: '1', pairAssignmentId: 'p1', evaluatorUserId: 'left_bias_user', isInstructor: false, itemLeftId: 'a', itemRightId: 'b', choice: 1, status: 'SUBMITTED' },
      { id: '2', pairAssignmentId: 'p2', evaluatorUserId: 'left_bias_user', isInstructor: false, itemLeftId: 'c', itemRightId: 'd', choice: 2, status: 'SUBMITTED' },
      { id: '3', pairAssignmentId: 'p3', evaluatorUserId: 'left_bias_user', isInstructor: false, itemLeftId: 'e', itemRightId: 'f', choice: 2, status: 'SUBMITTED' },
      { id: '4', pairAssignmentId: 'p4', evaluatorUserId: 'left_bias_user', isInstructor: false, itemLeftId: 'g', itemRightId: 'h', choice: 3, status: 'SUBMITTED' },
      { id: '5', pairAssignmentId: 'p5', evaluatorUserId: 'left_bias_user', isInstructor: false, itemLeftId: 'i', itemRightId: 'j', choice: 6, status: 'SUBMITTED' },
    ];

    const bias = detectPositionBias(comparisons, 0.75, 4);
    expect(bias).toHaveLength(1);
    expect(bias[0].evaluatorId).toBe('left_bias_user');
    expect(bias[0].side).toBe('LEFT');
    expect(bias[0].ratio).toBe(0.8);
  });

  it('QS-04: detects circular intransitivity (A > B, B > C, C > A)', () => {
    const comparisons: SubmittedComparison[] = [
      // A beats B (choice 1 = left beats right)
      { id: '1', pairAssignmentId: 'p1', evaluatorUserId: 'circle_user', isInstructor: false, itemLeftId: 'A', itemRightId: 'B', choice: 1, status: 'SUBMITTED' },
      // B beats C
      { id: '2', pairAssignmentId: 'p2', evaluatorUserId: 'circle_user', isInstructor: false, itemLeftId: 'B', itemRightId: 'C', choice: 1, status: 'SUBMITTED' },
      // C beats A
      { id: '3', pairAssignmentId: 'p3', evaluatorUserId: 'circle_user', isInstructor: false, itemLeftId: 'C', itemRightId: 'A', choice: 1, status: 'SUBMITTED' },
    ];

    const intrans = detectIntransitivity(comparisons, 0.2);
    expect(intrans).toHaveLength(1);
    expect(intrans[0].circularTriads).toBe(1);
    expect(intrans[0].ratio).toBe(1.0);
  });

  it('QS-05: detects speed runs (avg time on task < 3000ms)', () => {
    const comparisons: SubmittedComparison[] = [
      { id: '1', pairAssignmentId: 'p1', evaluatorUserId: 'speeder', isInstructor: false, itemLeftId: 'a', itemRightId: 'b', choice: 1, status: 'SUBMITTED', timeOnTaskMs: 1200 },
      { id: '2', pairAssignmentId: 'p2', evaluatorUserId: 'speeder', isInstructor: false, itemLeftId: 'c', itemRightId: 'd', choice: 2, status: 'SUBMITTED', timeOnTaskMs: 1800 },
    ];

    const speeders = detectSpeedRuns(comparisons, 3000);
    expect(speeders).toHaveLength(1);
    expect(speeders[0].evaluatorId).toBe('speeder');
    expect(speeders[0].avgTimeOnTaskMs).toBe(1500);
  });

  it('QS-07: computes Kendall\'s W rater agreement', () => {
    const comparisons: SubmittedComparison[] = [
      // Evaluator 1: a > b, b > c
      { id: '1', pairAssignmentId: 'p1', evaluatorUserId: 'r1', isInstructor: false, itemLeftId: 'a', itemRightId: 'b', choice: 1, status: 'SUBMITTED' },
      { id: '2', pairAssignmentId: 'p2', evaluatorUserId: 'r1', isInstructor: false, itemLeftId: 'b', itemRightId: 'c', choice: 1, status: 'SUBMITTED' },
      // Evaluator 2: a > b, b > c (perfect agreement)
      { id: '3', pairAssignmentId: 'p3', evaluatorUserId: 'r2', isInstructor: false, itemLeftId: 'a', itemRightId: 'b', choice: 1, status: 'SUBMITTED' },
      { id: '4', pairAssignmentId: 'p4', evaluatorUserId: 'r2', isInstructor: false, itemLeftId: 'b', itemRightId: 'c', choice: 1, status: 'SUBMITTED' },
    ];

    const kw = computeKendallsW(comparisons);
    expect(kw.w).toBeGreaterThan(0.8);
    expect(kw.isLowAgreement).toBe(false);
  });
});
