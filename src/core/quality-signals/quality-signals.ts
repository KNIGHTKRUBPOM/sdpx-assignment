import { Choice, SubmittedComparison } from '../types.js';

export interface QualitySignalReport {
  lowCoverageItems: { itemId: string; count: number }[]; // QS-01
  straightLiningEvaluators: { evaluatorId: string; dominantChoice: Choice; ratio: number }[]; // QS-02
  positionBiasEvaluators: { evaluatorId: string; side: 'LEFT' | 'RIGHT'; ratio: number }[]; // QS-03
  intransitiveEvaluators: { evaluatorId: string; circularTriads: number; totalTriads: number; ratio: number }[]; // QS-04
  speedRunEvaluators: { evaluatorId: string; avgTimeOnTaskMs: number }[]; // QS-05
  kendallsWPerCriterion: Record<string, { w: number; isLowAgreement: boolean }>; // QS-07
}

/**
 * QS-01: Low coverage (< threshold, default 3)
 */
export function detectLowCoverage(
  itemIds: string[],
  comparisons: SubmittedComparison[],
  minComparisons: number = 3,
): { itemId: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const id of itemIds) counts[id] = 0;

  for (const c of comparisons) {
    if (c.status !== 'SUBMITTED') continue;
    if (counts[c.itemLeftId] !== undefined) counts[c.itemLeftId]++;
    if (counts[c.itemRightId] !== undefined) counts[c.itemRightId]++;
  }

  return itemIds
    .filter((id) => (counts[id] ?? 0) < minComparisons)
    .map((id) => ({ itemId: id, count: counts[id] ?? 0 }));
}

/**
 * QS-02: Straight-lining (evaluator selects the same choice > threshold, default 80%)
 */
export function detectStraightLining(
  comparisons: SubmittedComparison[],
  thresholdRatio: number = 0.8,
  minAnswers: number = 4,
): { evaluatorId: string; dominantChoice: Choice; ratio: number }[] {
  const byEvaluator = groupComparisonsByEvaluator(comparisons);
  const results: { evaluatorId: string; dominantChoice: Choice; ratio: number }[] = [];

  for (const [evaluatorId, list] of Object.entries(byEvaluator)) {
    if (list.length < minAnswers) continue;

    const freq: Record<number, number> = {};
    for (const c of list) {
      freq[c.choice] = (freq[c.choice] ?? 0) + 1;
    }

    for (const [choiceStr, count] of Object.entries(freq)) {
      const ratio = count / list.length;
      if (ratio > thresholdRatio) {
        results.push({
          evaluatorId,
          dominantChoice: Number(choiceStr) as Choice,
          ratio,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * QS-03: Position bias (evaluator systematically picks left or right > threshold, default 80%)
 * Choice 1, 2, 3 favors Left. Choice 4, 5, 6 favors Right.
 */
export function detectPositionBias(
  comparisons: SubmittedComparison[],
  thresholdRatio: number = 0.8,
  minAnswers: number = 4,
): { evaluatorId: string; side: 'LEFT' | 'RIGHT'; ratio: number }[] {
  const byEvaluator = groupComparisonsByEvaluator(comparisons);
  const results: { evaluatorId: string; side: 'LEFT' | 'RIGHT'; ratio: number }[] = [];

  for (const [evaluatorId, list] of Object.entries(byEvaluator)) {
    if (list.length < minAnswers) continue;

    let leftFavors = 0;
    let rightFavors = 0;

    for (const c of list) {
      if (c.choice <= 3) leftFavors++;
      else rightFavors++;
    }

    const leftRatio = leftFavors / list.length;
    const rightRatio = rightFavors / list.length;

    if (leftRatio > thresholdRatio) {
      results.push({ evaluatorId, side: 'LEFT', ratio: leftRatio });
    } else if (rightRatio > thresholdRatio) {
      results.push({ evaluatorId, side: 'RIGHT', ratio: rightRatio });
    }
  }

  return results;
}

/**
 * QS-04: Intransitivity (Circular triads A > B, B > C, C > A within single evaluator > 20%)
 */
export function detectIntransitivity(
  comparisons: SubmittedComparison[],
  thresholdRatio: number = 0.2,
): { evaluatorId: string; circularTriads: number; totalTriads: number; ratio: number }[] {
  const byEvaluator = groupComparisonsByEvaluator(comparisons);
  const results: { evaluatorId: string; circularTriads: number; totalTriads: number; ratio: number }[] = [];

  for (const [evaluatorId, list] of Object.entries(byEvaluator)) {
    // Directed preferences: A -> B means evaluator preferred A over B
    const wins: Record<string, Set<string>> = {};

    for (const c of list) {
      if (c.choice === 1 || c.choice === 2 || c.choice === 3) {
        // Left won
        wins[c.itemLeftId] = wins[c.itemLeftId] ?? new Set();
        wins[c.itemLeftId].add(c.itemRightId);
      } else {
        // Right won
        wins[c.itemRightId] = wins[c.itemRightId] ?? new Set();
        wins[c.itemRightId].add(c.itemLeftId);
      }
    }

    const items = Object.keys(wins);
    if (items.length < 3) continue;

    let totalTriads = 0;
    let circularTriads = 0;

    // Check all triplets {i, j, k}
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        for (let k = j + 1; k < items.length; k++) {
          const a = items[i];
          const b = items[j];
          const c = items[k];

          const aBeatsB = wins[a]?.has(b);
          const bBeatsA = wins[b]?.has(a);
          const bBeatsC = wins[b]?.has(c);
          const cBeatsB = wins[c]?.has(b);
          const cBeatsA = wins[c]?.has(a);
          const aBeatsC = wins[a]?.has(c);

          const comparedAB = aBeatsB || bBeatsA;
          const comparedBC = bBeatsC || cBeatsB;
          const comparedCA = cBeatsA || aBeatsC;

          if (comparedAB && comparedBC && comparedCA) {
            totalTriads++;
            // Circle 1: a > b, b > c, c > a
            // Circle 2: a > c, c > b, b > a
            if ((aBeatsB && bBeatsC && cBeatsA) || (aBeatsC && cBeatsB && bBeatsA)) {
              circularTriads++;
            }
          }
        }
      }
    }

    if (totalTriads > 0) {
      const ratio = circularTriads / totalTriads;
      if (ratio > thresholdRatio) {
        results.push({ evaluatorId, circularTriads, totalTriads, ratio });
      }
    }
  }

  return results;
}

/**
 * QS-05: Speed run (average time-on-task < threshold, default 3000 ms)
 */
export function detectSpeedRuns(
  comparisons: SubmittedComparison[],
  minAvgTimeMs: number = 3000,
): { evaluatorId: string; avgTimeOnTaskMs: number }[] {
  const byEvaluator = groupComparisonsByEvaluator(comparisons);
  const results: { evaluatorId: string; avgTimeOnTaskMs: number }[] = [];

  for (const [evaluatorId, list] of Object.entries(byEvaluator)) {
    const timed = list.filter((c) => c.timeOnTaskMs !== undefined && c.timeOnTaskMs > 0);
    if (timed.length === 0) continue;

    const total = timed.reduce((acc, c) => acc + (c.timeOnTaskMs ?? 0), 0);
    const avg = total / timed.length;

    if (avg < minAvgTimeMs) {
      results.push({ evaluatorId, avgTimeOnTaskMs: Math.round(avg) });
    }
  }

  return results;
}

/**
 * QS-07: Low rater agreement (Kendall's W coefficient of concordance < 0.2)
 */
export function computeKendallsW(
  comparisons: SubmittedComparison[],
  criterionId?: string,
): { w: number; isLowAgreement: boolean } {
  // Filter submitted comparisons
  const valid = comparisons.filter((c) => c.status === 'SUBMITTED');
  if (valid.length === 0) return { w: 1.0, isLowAgreement: false };

  // Collect unique raters and unique items
  const raters = Array.from(new Set(valid.map((c) => c.evaluatorUserId)));
  const items = Array.from(
    new Set(valid.flatMap((c) => [c.itemLeftId, c.itemRightId])),
  );

  const m = raters.length;
  const n = items.length;

  if (m < 2 || n < 3) {
    return { w: 1.0, isLowAgreement: false };
  }

  // Calculate scores received by each item per rater
  const raterItemScores: Record<string, Record<string, number>> = {};
  for (const r of raters) {
    raterItemScores[r] = {};
    for (const item of items) {
      raterItemScores[r][item] = 0;
    }
  }

  for (const c of valid) {
    const r = c.evaluatorUserId;
    if (c.choice <= 3) {
      // left won
      raterItemScores[r][c.itemLeftId] += 1;
    } else {
      // right won
      raterItemScores[r][c.itemRightId] += 1;
    }
  }

  // Convert rater scores into ranks 1..n
  const sumOfRanks: Record<string, number> = {};
  for (const item of items) sumOfRanks[item] = 0;

  for (const r of raters) {
    const sorted = [...items].sort(
      (a, b) => raterItemScores[r][a] - raterItemScores[r][b],
    );
    for (let rank = 0; rank < sorted.length; rank++) {
      sumOfRanks[sorted[rank]] += rank + 1;
    }
  }

  const meanRankSum = (m * (n + 1)) / 2;
  let S = 0;
  for (const item of items) {
    S += Math.pow(sumOfRanks[item] - meanRankSum, 2);
  }

  // Kendall's W = 12 * S / (m^2 * (n^3 - n))
  const denom = Math.pow(m, 2) * (Math.pow(n, 3) - n);
  const w = denom > 0 ? (12 * S) / denom : 1.0;
  const clampedW = Math.max(0, Math.min(1.0, w));

  return {
    w: clampedW,
    isLowAgreement: clampedW < 0.2,
  };
}

/**
 * Full Quality Report computation for assignment
 */
export function computeQualitySignals(
  itemIds: string[],
  comparisons: SubmittedComparison[],
): QualitySignalReport {
  return {
    lowCoverageItems: detectLowCoverage(itemIds, comparisons),
    straightLiningEvaluators: detectStraightLining(comparisons),
    positionBiasEvaluators: detectPositionBias(comparisons),
    intransitiveEvaluators: detectIntransitivity(comparisons),
    speedRunEvaluators: detectSpeedRuns(comparisons),
    kendallsWPerCriterion: {
      default: computeKendallsW(comparisons),
    },
  };
}

function groupComparisonsByEvaluator(
  comparisons: SubmittedComparison[],
): Record<string, SubmittedComparison[]> {
  const map: Record<string, SubmittedComparison[]> = {};
  for (const c of comparisons) {
    if (c.status !== 'SUBMITTED') continue;
    map[c.evaluatorUserId] = map[c.evaluatorUserId] ?? [];
    map[c.evaluatorUserId].push(c);
  }
  return map;
}
