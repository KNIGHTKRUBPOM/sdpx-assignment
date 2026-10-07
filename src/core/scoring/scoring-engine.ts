import {
  Choice,
  Criterion,
  CriterionScoreResult,
  EvaluationSide,
  ItemScoreSummary,
  PersonalScoreResult,
  ScoringConfig,
  SubmittedComparison,
} from '../types.js';

/**
 * Maps a 6-point forced choice to points [left, right]
 * PRD §9.1 Table:
 * 1: ซ้ายดีกว่ามาก -> 1.0, 0.0
 * 2: ซ้ายดีกว่า     -> 0.8, 0.2
 * 3: ซ้ายดีกว่าเล็กน้อย -> 0.6, 0.4
 * 4: ขวาดีกว่าเล็กน้อย -> 0.4, 0.6
 * 5: ขวาดีกว่า     -> 0.2, 0.8
 * 6: ขวาดีกว่ามาก -> 0.0, 1.0
 */
export function choiceToPoints(choice: Choice): { left: number; right: number } {
  switch (choice) {
    case 1:
      return { left: 1.0, right: 0.0 };
    case 2:
      return { left: 0.8, right: 0.2 };
    case 3:
      return { left: 0.6, right: 0.4 };
    case 4:
      return { left: 0.4, right: 0.6 };
    case 5:
      return { left: 0.2, right: 0.8 };
    case 6:
      return { left: 0.0, right: 1.0 };
    default:
      throw new Error(`Invalid choice: ${choice}. Must be between 1 and 6.`);
  }
}

/**
 * Computes Quality Index q(i, c) for item i in criterion c (PRD §9.2)
 * q(i,c) = Σ_e ( w_e * s_{i,e} ) / Σ_e ( w_e )
 */
export function computeQualityIndex(
  itemId: string,
  comparisons: SubmittedComparison[],
  instructorWeight: number = 1.0,
): {
  qualityIndex: number;
  comparisonCount: number;
  effectiveWeightSum: number;
} {
  let weightedPointsSum = 0;
  let totalWeights = 0;
  let count = 0;

  for (const cmp of comparisons) {
    if (cmp.status !== 'SUBMITTED') continue;

    const isLeft = cmp.itemLeftId === itemId;
    const isRight = cmp.itemRightId === itemId;

    if (!isLeft && !isRight) continue;

    const points = choiceToPoints(cmp.choice);
    const itemPoints = isLeft ? points.left : points.right;
    const weight = cmp.isInstructor ? instructorWeight : 1.0;

    weightedPointsSum += weight * itemPoints;
    totalWeights += weight;
    count++;
  }

  if (totalWeights === 0) {
    return { qualityIndex: 0, comparisonCount: 0, effectiveWeightSum: 0 };
  }

  const qualityIndex = weightedPointsSum / totalWeights;
  return {
    qualityIndex,
    comparisonCount: count,
    effectiveWeightSum: totalWeights,
  };
}

/**
 * Computes score ratio using Band Mapping (PRD §9.3)
 * score_ratio(i,c) = floor + (ceiling - floor) * q(i,c)
 */
export function computeScoreRatio(
  qualityIndex: number,
  floor: number = 0.6,
  ceiling: number = 1.0,
): number {
  if (floor >= ceiling) {
    throw new Error(`Score floor (${floor}) must be less than ceiling (${ceiling})`);
  }
  const clampedQ = Math.max(0, Math.min(1, qualityIndex));
  return floor + (ceiling - floor) * clampedQ;
}

/**
 * Computes item scores across all criteria for one side (GROUP or INDIVIDUAL)
 */
export function computeItemScores(
  itemId: string,
  side: EvaluationSide,
  criteria: Criterion[],
  comparisons: SubmittedComparison[],
  config: ScoringConfig,
): ItemScoreSummary {
  const maxScoreSide = side === 'GROUP' ? config.groupMaxScore : config.individualMaxScore;
  const criterionScores: Record<string, CriterionScoreResult> = {};
  let totalComponentScore = 0;
  const itemFlags: Set<string> = new Set();

  for (const crit of criteria) {
    if (crit.side !== side) continue;

    const { qualityIndex, comparisonCount, effectiveWeightSum } = computeQualityIndex(
      itemId,
      comparisons,
      config.instructorWeight,
    );

    const scoreRatio = computeScoreRatio(qualityIndex, config.floor, config.ceiling);
    const weightedScore = scoreRatio * (crit.weightPct / 100) * maxScoreSide;
    totalComponentScore += weightedScore;

    const critFlags: string[] = [];
    if (comparisonCount < config.minComparisons) {
      critFlags.push('LOW_CONFIDENCE');
      itemFlags.add('LOW_CONFIDENCE');
    }

    criterionScores[crit.id] = {
      criterionId: crit.id,
      qualityIndex,
      scoreRatio,
      weightedScore,
      comparisonCount,
      effectiveWeightSum,
      flags: critFlags,
    };
  }

  return {
    itemId,
    side,
    criterionScores,
    totalComponentScore,
    flags: Array.from(itemFlags),
  };
}

/**
 * Computes participation multiplier M (PRD §9.4)
 * p = (submitted_group + submitted_indiv) / (assigned_group + assigned_indiv)
 * M = min(1.0, p / completion_threshold)
 */
export function computeParticipationMultiplier(
  assignedTotal: number,
  submittedTotal: number,
  completionThreshold: number = 0.9,
): { participationRatio: number; multiplier: number } {
  if (assignedTotal <= 0) {
    return { participationRatio: 1.0, multiplier: 1.0 };
  }

  const p = Math.max(0, Math.min(1, submittedTotal / assignedTotal));
  const m = Math.max(0, Math.min(1.0, p / completionThreshold));

  return {
    participationRatio: p,
    multiplier: m,
  };
}

/**
 * Computes the final personal score for a student (PRD §9.4, §9.5)
 * final_personal_score = (group_component + individual_component) * M
 */
export function computeFinalPersonalScore(params: {
  studentId: string;
  groupId: string;
  groupComponentScore: number;
  individualComponentScore: number;
  assignedGroupComparisons: number;
  submittedGroupComparisons: number;
  assignedIndividualComparisons: number;
  submittedIndividualComparisons: number;
  completionThreshold?: number;
  isFinal?: boolean;
}): PersonalScoreResult {
  const assignedTotal =
    params.assignedGroupComparisons + params.assignedIndividualComparisons;
  const submittedTotal =
    params.submittedGroupComparisons + params.submittedIndividualComparisons;

  const { participationRatio, multiplier } = computeParticipationMultiplier(
    assignedTotal,
    submittedTotal,
    params.completionThreshold ?? 0.9,
  );

  const rawSum = params.groupComponentScore + params.individualComponentScore;
  const finalPersonalScore = rawSum * multiplier;

  return {
    studentId: params.studentId,
    groupId: params.groupId,
    groupComponentScore: params.groupComponentScore,
    individualComponentScore: params.individualComponentScore,
    assignedGroupComparisons: params.assignedGroupComparisons,
    submittedGroupComparisons: params.submittedGroupComparisons,
    assignedIndividualComparisons: params.assignedIndividualComparisons,
    submittedIndividualComparisons: params.submittedIndividualComparisons,
    participationRatio,
    multiplier,
    finalPersonalScore,
    isFinal: params.isFinal ?? false,
  };
}
