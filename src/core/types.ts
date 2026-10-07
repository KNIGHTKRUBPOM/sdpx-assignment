/**
 * Core domain types and interfaces for PairEval
 */

export type Role = 'OWNER' | 'CO_TEACHER' | 'TA' | 'STUDENT';

export type AssignmentStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'OPEN'
  | 'CLOSED'
  | 'FINALIZED'
  | 'ARCHIVED';

export type EvaluationSide = 'GROUP' | 'INDIVIDUAL';

export type ComparisonStatus = 'DRAFT' | 'SUBMITTED' | 'EXCLUDED';

/**
 * 6-point forced choice:
 * 1: ซ้ายดีกว่ามาก (1.0 vs 0.0)
 * 2: ซ้ายดีกว่า (0.8 vs 0.2)
 * 3: ซ้ายดีกว่าเล็กน้อย (0.6 vs 0.4)
 * 4: ขวาดีกว่าเล็กน้อย (0.4 vs 0.6)
 * 5: ขวาดีกว่า (0.2 vs 0.8)
 * 6: ขวาดีกว่ามาก (0.0 vs 1.0)
 */
export type Choice = 1 | 2 | 3 | 4 | 5 | 6;

export interface Student {
  id: string;
  email: string;
  displayName: string;
  groupId: string;
}

export interface Group {
  id: string;
  name: string;
  memberIds: string[];
}

export interface Criterion {
  id: string;
  side: EvaluationSide;
  name: string;
  weightPct: number; // e.g. 40 for 40%
  description?: string;
}

export interface PairAssignment {
  id: string;
  assignmentId: string;
  criterionId: string;
  side: EvaluationSide;
  itemAId: string;
  itemBId: string;
  evaluatorUserId: string;
  displayLeftItemId: string; // The item displayed on the left side (FR-PAIR-08)
  generation: number;
}

export interface SubmittedComparison {
  id: string;
  pairAssignmentId: string;
  evaluatorUserId: string;
  isInstructor: boolean;
  itemLeftId: string;
  itemRightId: string;
  choice: Choice;
  status: ComparisonStatus;
  timeOnTaskMs?: number;
}

export interface ScoringConfig {
  floor: number; // default 0.60
  ceiling: number; // default 1.00
  instructorWeight: number; // default 1.0
  minComparisons: number; // default 3
  completionThreshold: number; // default 0.90
  groupMaxScore: number;
  individualMaxScore: number;
}

export interface CriterionScoreResult {
  criterionId: string;
  qualityIndex: number;
  scoreRatio: number;
  weightedScore: number;
  comparisonCount: number;
  effectiveWeightSum: number;
  flags: string[];
}

export interface ItemScoreSummary {
  itemId: string;
  side: EvaluationSide;
  criterionScores: Record<string, CriterionScoreResult>;
  totalComponentScore: number;
  flags: string[];
}

export interface PersonalScoreResult {
  studentId: string;
  groupId: string;
  groupComponentScore: number;
  individualComponentScore: number;
  assignedGroupComparisons: number;
  submittedGroupComparisons: number;
  assignedIndividualComparisons: number;
  submittedIndividualComparisons: number;
  participationRatio: number; // p
  multiplier: number; // M
  finalPersonalScore: number;
  isFinal: boolean;
}

export interface GroupFeasibilityResult {
  feasible: boolean;
  achievableCoverage: number;
  targetCoverage: number;
  workloadPerEvaluator: number;
  totalComparisons: number;
  constraintViolations: string[];
  message: string;
}
