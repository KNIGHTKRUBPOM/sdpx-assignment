import Decimal from "decimal.js";
import type { CriterionInput, AssignmentConfig } from "./model";
import type {
  ItemScoreSummary,
  SubmittedComparison,
  EvaluationSide,
} from "../core/types";

export type ScopedComparison = SubmittedComparison & {
  assignmentId: string;
  criterionId: string;
};
export const FORMULA_VERSION = "paireval-band-v2.1";
export function scoreItem(
  assignmentId: string,
  itemId: string,
  side: EvaluationSide,
  criteria: CriterionInput[],
  comparisons: ScopedComparison[],
  config: AssignmentConfig,
): ItemScoreSummary {
  const result: ItemScoreSummary = {
    itemId,
    side,
    criterionScores: {},
    totalComponentScore: 0,
    flags: [],
  };
  if (side === "INDIVIDUAL" && config.individualMaxScore === 0) return result;
  let total = new Decimal(0);
  for (const c of criteria.filter((c) => c.side === side)) {
    const relevant = comparisons.filter(
      (x) =>
        x.assignmentId === assignmentId &&
        x.criterionId === c.id &&
        x.status === "SUBMITTED" &&
        (x.itemLeftId === itemId || x.itemRightId === itemId),
    );
    let numerator = new Decimal(0),
      denominator = new Decimal(0);
    for (const x of relevant) {
      const point = new Decimal(
        x.itemLeftId === itemId ? 6 - x.choice : x.choice - 1,
      ).div(5);
      const weight = new Decimal(x.isInstructor ? config.instructorWeight : 1);
      numerator = numerator.plus(point.times(weight));
      denominator = denominator.plus(weight);
    }
    const q = denominator.isZero()
      ? new Decimal(0)
      : numerator.div(denominator);
    const ratio = new Decimal(config.floor).plus(
      new Decimal(config.ceiling).minus(config.floor).times(q),
    );
    const weighted = ratio
      .times(c.weightPct)
      .div(100)
      .times(
        side === "GROUP" ? config.groupMaxScore : config.individualMaxScore,
      );
    const flags =
      relevant.length < config.minComparisons || denominator.isZero()
        ? ["LOW_CONFIDENCE"]
        : [];
    result.criterionScores[c.id] = {
      criterionId: c.id,
      qualityIndex: q.toNumber(),
      scoreRatio: ratio.toNumber(),
      weightedScore: weighted.toNumber(),
      comparisonCount: relevant.length,
      effectiveWeightSum: denominator.toNumber(),
      flags,
    };
    total = total.plus(weighted);
    if (flags.length) result.flags = ["LOW_CONFIDENCE"];
  }
  result.totalComponentScore = total.toNumber();
  return result;
}
