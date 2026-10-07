import { sanitizeCsvCell } from '../roster/csv-roster.js';
import {
  Criterion,
  Group,
  ItemScoreSummary,
  PersonalScoreResult,
  Student,
  SubmittedComparison,
} from '../types.js';

export interface GroupSummaryReportRow {
  groupId: string;
  groupName: string;
  criterionId: string;
  criterionName: string;
  qualityIndex: number;
  comparisonCount: number;
  weightedScore: number;
  flags: string[];
}

export interface IndividualSummaryReportRow {
  studentId: string;
  displayName: string;
  email: string;
  groupId: string;
  groupName: string;
  criterionId: string;
  criterionName: string;
  qualityIndex: number;
  comparisonCount: number;
  weightedScore: number;
  participationRatio: number;
  multiplier: number;
  finalPersonalScore: number;
  flags: string[];
}

export interface PairCoverageReportRow {
  pairKey: string;
  itemAName: string;
  itemBName: string;
  actualCoverage: number;
  averagePointA: number;
  averagePointB: number;
}

export interface StudentSelfScoreView {
  isFinal: boolean;
  groupScore: number;
  individualScore?: number;
  participationRatio: number;
  multiplier: number;
  finalPersonalScore: number;
  statusMessage?: string;
  label: string; // e.g. "ชั่วคราว — อาจเปลี่ยนแปลงได้" (FR-SCORE-07)
}

/**
 * Builds Student Self-View with strict k-anonymity (FR-REPORT-06, FR-ANON-01, FR-ANON-02)
 */
export function buildStudentSelfScoreView(params: {
  studentId: string;
  groupSummary: ItemScoreSummary;
  personalResult: PersonalScoreResult;
  individualSubmittedEvaluatorsCount: number;
  kAnonymityMin?: number;
  isFinal?: boolean;
}): StudentSelfScoreView {
  const kMin = params.kAnonymityMin ?? 3;
  const isFinal = params.isFinal ?? false;
  const label = isFinal ? 'คะแนนสุดท้าย' : 'ชั่วคราว — อาจเปลี่ยนแปลงได้';

  // FR-ANON-02: k-anonymity threshold check
  // Do not reveal individual score until submitted evaluators >= kMin
  const meetsAnonymity = params.individualSubmittedEvaluatorsCount >= kMin;

  return {
    isFinal,
    groupScore: Number(params.groupSummary.totalComponentScore.toFixed(3)),
    individualScore: meetsAnonymity
      ? Number(params.personalResult.individualComponentScore.toFixed(3))
      : undefined,
    participationRatio: Number(params.personalResult.participationRatio.toFixed(3)),
    multiplier: Number(params.personalResult.multiplier.toFixed(3)),
    finalPersonalScore: meetsAnonymity
      ? Number(params.personalResult.finalPersonalScore.toFixed(2))
      : Number(params.groupSummary.totalComponentScore.toFixed(2)),
    statusMessage: meetsAnonymity
      ? undefined
      : 'ยังมีข้อมูลการประเมินรายบุคคลไม่เพียงพอตามเกณฑ์ความเป็นส่วนตัว (k-anonymity)',
    label,
  };
}

/**
 * Generates CSV string with UTF-8 BOM (FR-EXPORT-01)
 */
export function exportToCsvString(headers: string[], rows: (string | number)[][]): string {
  const bom = '\uFEFF';
  const csvLines: string[] = [];

  csvLines.push(headers.map((h) => `"${sanitizeCsvCell(h)}"`).join(','));

  for (const row of rows) {
    const formatted = row.map((cell) => {
      const str = String(cell);
      return `"${sanitizeCsvCell(str)}"`;
    });
    csvLines.push(formatted.join(','));
  }

  return bom + csvLines.join('\n');
}

/**
 * Formats standardized export filename (FR-EXPORT-05)
 * {classroom_slug}_{assignment_slug}_{report}_{YYYYMMDD-HHmm}.csv
 */
export function formatExportFilename(
  classroomSlug: string,
  assignmentSlug: string,
  reportType: string,
  date: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const min = pad(date.getUTCMinutes());

  return `${classroomSlug}_${assignmentSlug}_${reportType}_${yyyy}${mm}${dd}-${hh}${min}.csv`;
}

/**
 * Pseudonymizes evaluator ID for export default (FR-EXPORT-03)
 */
export function generateEvaluatorPseudonym(
  evaluatorUserId: string,
  assignmentId: string,
): string {
  let hash = 0;
  const combined = `${evaluatorUserId}_${assignmentId}`;
  for (let i = 0; i < combined.length; i++) {
    hash = (Math.imul(31, hash) + combined.charCodeAt(i)) >>> 0;
  }
  return `EVAL-${hash.toString(16).padStart(8, '0').toUpperCase()}`;
}
