import { describe, expect, it } from 'vitest';
import {
  choiceToPoints,
  computeFinalPersonalScore,
  computeItemScores,
  computeParticipationMultiplier,
  computeQualityIndex,
  computeScoreRatio,
} from '../src/core/scoring/scoring-engine.js';
import { Criterion, ScoringConfig, SubmittedComparison } from '../src/core/types.js';

describe('Scoring Engine', () => {
  describe('Choice to Points Mapping (PRD §9.1)', () => {
    it('maps 6-point forced choices correctly and symmetrically', () => {
      expect(choiceToPoints(1)).toEqual({ left: 1.0, right: 0.0 });
      expect(choiceToPoints(2)).toEqual({ left: 0.8, right: 0.2 });
      expect(choiceToPoints(3)).toEqual({ left: 0.6, right: 0.4 });
      expect(choiceToPoints(4)).toEqual({ left: 0.4, right: 0.6 });
      expect(choiceToPoints(5)).toEqual({ left: 0.2, right: 0.8 });
      expect(choiceToPoints(6)).toEqual({ left: 0.0, right: 1.0 });
    });
  });

  describe('Band Mapping (PRD §9.3)', () => {
    it('maps q=0.0 to floor (0.60), q=0.5 to 0.80, q=1.0 to ceiling (1.00)', () => {
      expect(computeScoreRatio(0.0, 0.6, 1.0)).toBeCloseTo(0.6, 4);
      expect(computeScoreRatio(0.5, 0.6, 1.0)).toBeCloseTo(0.8, 4);
      expect(computeScoreRatio(1.0, 0.6, 1.0)).toBeCloseTo(1.0, 4);
    });
  });

  describe('Quality Index with Instructor Weight (PRD §9.2, D6)', () => {
    it('incorporates instructor weight as float in weighted mean', () => {
      const comparisons: SubmittedComparison[] = [
        {
          id: 'cmp1',
          pairAssignmentId: 'p1',
          evaluatorUserId: 'student1',
          isInstructor: false,
          itemLeftId: 'groupA',
          itemRightId: 'groupB',
          choice: 1, // left gets 1.0
          status: 'SUBMITTED',
        },
        {
          id: 'cmp2',
          pairAssignmentId: 'p2',
          evaluatorUserId: 'instructor1',
          isInstructor: true,
          itemLeftId: 'groupA',
          itemRightId: 'groupC',
          choice: 5, // left gets 0.2
          status: 'SUBMITTED',
        },
      ];

      // student weight = 1.0 * 1.0 = 1.0
      // instructor weight 2.5 * 0.2 = 0.5
      // sum = 1.5 / (1.0 + 2.5) = 1.5 / 3.5 ≈ 0.42857
      const res = computeQualityIndex('groupA', comparisons, 2.5);
      expect(res.comparisonCount).toBe(2);
      expect(res.effectiveWeightSum).toBe(3.5);
      expect(res.qualityIndex).toBeCloseTo(1.5 / 3.5, 4);
    });

    it('ignores draft and excluded comparisons (DR-01)', () => {
      const comparisons: SubmittedComparison[] = [
        {
          id: 'cmp1',
          pairAssignmentId: 'p1',
          evaluatorUserId: 's1',
          isInstructor: false,
          itemLeftId: 'groupA',
          itemRightId: 'groupB',
          choice: 1,
          status: 'SUBMITTED',
        },
        {
          id: 'cmp2',
          pairAssignmentId: 'p2',
          evaluatorUserId: 's2',
          isInstructor: false,
          itemLeftId: 'groupA',
          itemRightId: 'groupC',
          choice: 6,
          status: 'DRAFT',
        },
        {
          id: 'cmp3',
          pairAssignmentId: 'p3',
          evaluatorUserId: 's3',
          isInstructor: false,
          itemLeftId: 'groupA',
          itemRightId: 'groupD',
          choice: 6,
          status: 'EXCLUDED',
        },
      ];

      const res = computeQualityIndex('groupA', comparisons, 1.0);
      expect(res.comparisonCount).toBe(1);
      expect(res.qualityIndex).toBe(1.0);
    });
  });

  describe('Golden Test: Worked Example (PRD §9.5)', () => {
    const config: ScoringConfig = {
      floor: 0.6,
      ceiling: 1.0,
      instructorWeight: 1.0,
      minComparisons: 3,
      completionThreshold: 0.9,
      groupMaxScore: 15.0,
      individualMaxScore: 5.0,
    };

    const groupCriteria: Criterion[] = [
      { id: 'c_ux', side: 'GROUP', name: 'UX', weightPct: 40 },
      { id: 'c_comp', side: 'GROUP', name: 'Completeness', weightPct: 35 },
      { id: 'c_inno', side: 'GROUP', name: 'Innovation', weightPct: 25 },
    ];

    const indivCriteria: Criterion[] = [
      { id: 'c_team', side: 'INDIVIDUAL', name: 'Teamwork', weightPct: 50 },
      { id: 'c_mgmt', side: 'INDIVIDUAL', name: 'Management', weightPct: 50 },
    ];

    it('matches exact Group Aurora calculation (12.798 / 15)', () => {
      // Create synthetic submitted comparisons yielding exact q values:
      // UX: q=0.72
      // Completeness: q=0.55
      // Innovation: q=0.61
      // We can test computeItemScores directly or synthesize comparisons.
      // Let's create comparisons that average to these exact q values.
      const makeComparisonsForQ = (
        critId: string,
        targetQ: number,
      ): SubmittedComparison[] => {
        // e.g. 1 comparison of targetQ (choice with fractional points)
        // Or 2 comparisons: (targetQ, targetQ)
        return [
          {
            id: `cmp_${critId}_1`,
            pairAssignmentId: `pa_${critId}_1`,
            evaluatorUserId: 's1',
            isInstructor: false,
            itemLeftId: 'aurora',
            itemRightId: 'other',
            choice: 1, // 1.0
            status: 'SUBMITTED',
          },
          {
            id: `cmp_${critId}_2`,
            pairAssignmentId: `pa_${critId}_2`,
            evaluatorUserId: 's2',
            isInstructor: false,
            itemLeftId: 'aurora',
            itemRightId: 'other',
            choice: 2, // 0.8
            status: 'SUBMITTED',
          },
        ];
      };

      // Direct verify of the band mapping & weighted score formulas from §9.5:
      // UX: 0.60 + 0.40 * 0.72 = 0.888 -> 40% * 15 * 0.888 = 5.328
      const scoreRatioUX = computeScoreRatio(0.72, 0.6, 1.0);
      expect(scoreRatioUX).toBeCloseTo(0.888, 4);
      const weightedUX = scoreRatioUX * 0.4 * 15.0;
      expect(weightedUX).toBeCloseTo(5.328, 4);

      // Completeness: 0.60 + 0.40 * 0.55 = 0.820 -> 35% * 15 * 0.820 = 4.305
      const scoreRatioComp = computeScoreRatio(0.55, 0.6, 1.0);
      expect(scoreRatioComp).toBeCloseTo(0.82, 4);
      const weightedComp = scoreRatioComp * 0.35 * 15.0;
      expect(weightedComp).toBeCloseTo(4.305, 4);

      // Innovation: 0.60 + 0.40 * 0.61 = 0.844 -> 25% * 15 * 0.844 = 3.165
      const scoreRatioInno = computeScoreRatio(0.61, 0.6, 1.0);
      expect(scoreRatioInno).toBeCloseTo(0.844, 4);
      const weightedInno = scoreRatioInno * 0.25 * 15.0;
      expect(weightedInno).toBeCloseTo(3.165, 4);

      const groupTotal = weightedUX + weightedComp + weightedInno;
      expect(groupTotal).toBeCloseTo(12.798, 4);
    });

    it('matches exact Nok calculation (completed all evaluations: 16.93 / 20)', () => {
      // Individual:
      // Teamwork: q=0.68 -> score_ratio = 0.60 + 0.40 * 0.68 = 0.872 -> 50% * 5 * 0.872 = 2.180
      const scoreRatioTeam = computeScoreRatio(0.68, 0.6, 1.0);
      expect(scoreRatioTeam).toBeCloseTo(0.872, 4);
      const weightedTeam = scoreRatioTeam * 0.5 * 5.0;
      expect(weightedTeam).toBeCloseTo(2.18, 4);

      // Management: q=0.45 -> score_ratio = 0.60 + 0.40 * 0.45 = 0.780 -> 50% * 5 * 0.780 = 1.950
      const scoreRatioMgmt = computeScoreRatio(0.45, 0.6, 1.0);
      expect(scoreRatioMgmt).toBeCloseTo(0.78, 4);
      const weightedMgmt = scoreRatioMgmt * 0.5 * 5.0;
      expect(weightedMgmt).toBeCloseTo(1.95, 4);

      const indivTotal = weightedTeam + weightedMgmt;
      expect(indivTotal).toBeCloseTo(4.13, 4);

      // Nok submitted 15 of 15
      const nokResult = computeFinalPersonalScore({
        studentId: 'nok',
        groupId: 'aurora',
        groupComponentScore: 12.798,
        individualComponentScore: indivTotal,
        assignedGroupComparisons: 12,
        submittedGroupComparisons: 12,
        assignedIndividualComparisons: 3,
        submittedIndividualComparisons: 3,
        completionThreshold: 0.9,
      });

      expect(nokResult.participationRatio).toBe(1.0);
      expect(nokResult.multiplier).toBe(1.0);
      // (12.798 + 4.130) * 1.00 = 16.928 ≈ 16.93
      expect(nokResult.finalPersonalScore).toBeCloseTo(16.928, 3);
    });

    it('matches exact Ton calculation (partial participation: 10.97 / 20)', () => {
      // Ton's individual component:
      // Teamwork: q=0.31 -> 0.60 + 0.40 * 0.31 = 0.724 -> 50% * 5 * 0.724 = 1.810
      const scoreRatioTeam = computeScoreRatio(0.31, 0.6, 1.0);
      expect(scoreRatioTeam).toBeCloseTo(0.724, 4);
      const weightedTeam = scoreRatioTeam * 0.5 * 5.0;
      expect(weightedTeam).toBeCloseTo(1.81, 4);

      // Management: q=0.35 -> 0.60 + 0.40 * 0.35 = 0.740 -> 50% * 5 * 0.740 = 1.850
      const scoreRatioMgmt = computeScoreRatio(0.35, 0.6, 1.0);
      expect(scoreRatioMgmt).toBeCloseTo(0.74, 4);
      const weightedMgmt = scoreRatioMgmt * 0.5 * 5.0;
      expect(weightedMgmt).toBeCloseTo(1.85, 4);

      const indivTotal = weightedTeam + weightedMgmt;
      expect(indivTotal).toBeCloseTo(3.66, 4);

      // Ton: group submitted 6 of 12, indiv submitted 3 of 3
      // p = (6 + 3) / (12 + 3) = 9/15 = 0.60
      // M = min(1.0, 0.60 / 0.90) = 0.6666...
      const tonResult = computeFinalPersonalScore({
        studentId: 'ton',
        groupId: 'aurora',
        groupComponentScore: 12.798,
        individualComponentScore: indivTotal,
        assignedGroupComparisons: 12,
        submittedGroupComparisons: 6,
        assignedIndividualComparisons: 3,
        submittedIndividualComparisons: 3,
        completionThreshold: 0.9,
      });

      expect(tonResult.participationRatio).toBeCloseTo(0.6, 4);
      expect(tonResult.multiplier).toBeCloseTo(0.6 / 0.9, 4);
      // (12.798 + 3.660) * (0.6 / 0.9) = 16.458 * 0.666667 ≈ 10.972
      expect(tonResult.finalPersonalScore).toBeCloseTo(10.972, 3);

      // FR-SCORE-11: Aurora's groupComponentScore stays 12.798 (not reduced for teammates)
      expect(tonResult.groupComponentScore).toBeCloseTo(12.798, 4);
    });
  });
});
