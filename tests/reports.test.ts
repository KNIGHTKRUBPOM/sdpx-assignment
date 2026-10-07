import { describe, expect, it } from 'vitest';
import {
  buildStudentSelfScoreView,
  exportToCsvString,
  formatExportFilename,
  generateEvaluatorPseudonym,
} from '../src/core/reports/reports.js';
import { ItemScoreSummary, PersonalScoreResult } from '../src/core/types.js';

describe('Reports & Export Module (PRD §7.7, §7.8, §14.2)', () => {
  const dummyGroupSummary: ItemScoreSummary = {
    itemId: 'group1',
    side: 'GROUP',
    criterionScores: {},
    totalComponentScore: 12.5,
    flags: [],
  };

  const dummyPersonalResult: PersonalScoreResult = {
    studentId: 'student1',
    groupId: 'group1',
    groupComponentScore: 12.5,
    individualComponentScore: 4.2,
    assignedGroupComparisons: 10,
    submittedGroupComparisons: 10,
    assignedIndividualComparisons: 3,
    submittedIndividualComparisons: 3,
    participationRatio: 1.0,
    multiplier: 1.0,
    finalPersonalScore: 16.7,
    isFinal: false,
  };

  it('FR-ANON-02: hides individual score when k-anonymity threshold (< 3) is not met', () => {
    // Only 2 submitted evaluators
    const view = buildStudentSelfScoreView({
      studentId: 'student1',
      groupSummary: dummyGroupSummary,
      personalResult: dummyPersonalResult,
      individualSubmittedEvaluatorsCount: 2,
      kAnonymityMin: 3,
      isFinal: false,
    });

    expect(view.individualScore).toBeUndefined();
    expect(view.groupScore).toBe(12.5);
    expect(view.statusMessage).toContain('k-anonymity');
    expect(view.label).toBe('ชั่วคราว — อาจเปลี่ยนแปลงได้');
  });

  it('FR-ANON-02: reveals individual score when k-anonymity threshold (>= 3) is met', () => {
    const view = buildStudentSelfScoreView({
      studentId: 'student1',
      groupSummary: dummyGroupSummary,
      personalResult: dummyPersonalResult,
      individualSubmittedEvaluatorsCount: 3,
      kAnonymityMin: 3,
      isFinal: true,
    });

    expect(view.individualScore).toBe(4.2);
    expect(view.finalPersonalScore).toBe(16.7);
    expect(view.statusMessage).toBeUndefined();
    expect(view.label).toBe('คะแนนสุดท้าย');
  });

  it('FR-EXPORT-01: CSV export contains UTF-8 BOM (\\uFEFF) for Excel Thai encoding support', () => {
    const csv = exportToCsvString(
      ['ชื่อกลุ่ม', 'คะแนนรวม'],
      [['กลุ่ม Aurora', 12.798]],
    );

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"กลุ่ม Aurora"');
  });

  it('FR-EXPORT-05: formats export filename matching pattern {classroom_slug}_{assignment_slug}_{report}_{YYYYMMDD-HHmm}.csv', () => {
    const fixedDate = new Date('2026-10-07T14:30:00Z');
    const filename = formatExportFilename('sdpx-2026', 'project-eval', 'group-summary', fixedDate);

    expect(filename).toBe('sdpx-2026_project-eval_group-summary_20261007-1430.csv');
  });

  it('FR-EXPORT-03: generates deterministic pseudonym for evaluator identity protection', () => {
    const p1 = generateEvaluatorPseudonym('user123', 'asg456');
    const p2 = generateEvaluatorPseudonym('user123', 'asg456');
    const p3 = generateEvaluatorPseudonym('user999', 'asg456');

    expect(p1).toMatch(/^EVAL-[0-9A-F]{8}$/);
    expect(p1).toBe(p2); // deterministic
    expect(p1).not.toBe(p3); // different user
  });
});
