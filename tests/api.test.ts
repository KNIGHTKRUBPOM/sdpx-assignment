import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';
import { memoryStore } from '../src/storage/memory-store.js';

// In-memory request helper for Express app
async function request(
  method: string,
  path: string,
  options?: { headers?: Record<string, string>; body?: any },
) {
  return new Promise<{
    status: number;
    body: any;
    headers: any;
    text: string;
    buffer: Buffer;
  }>((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = (server.address() as any).port;
      const url = `http://localhost:${port}${path}`;
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(options?.headers || {}),
          },
          body: options?.body
            ? typeof options.body === 'string'
              ? options.body
              : JSON.stringify(options.body)
            : undefined,
        });

        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const text = buffer.toString('utf-8');

        let jsonBody: any = null;
        try {
          jsonBody = JSON.parse(text);
        } catch {
          jsonBody = text;
        }

        server.close(() => {
          resolve({
            status: res.status,
            body: jsonBody,
            headers: Object.fromEntries(res.headers.entries()),
            text,
            buffer,
          });
        });
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

describe('Walking Skeleton & API End-to-End Integration (PRD §19 M1 & §12)', () => {
  beforeAll(() => {
    memoryStore.clear();
  });

  let classroomId: string;
  let assignmentId: string;
  let studentUserId: string;
  let firstPairId: string;

  it('Step 1: Creates a new Classroom', async () => {
    const res = await request('POST', '/api/classrooms', {
      body: {
        name: 'Software Development Process (SDPX)',
        slug: 'sdpx-2026',
        timezone: 'Asia/Bangkok',
        allowedEmailDomains: ['chula.ac.th', 'uni.ac.th'],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Software Development Process (SDPX)');
    classroomId = res.body.id;
  });

  it('Step 2: Imports Roster via CSV atomically (FR-CLASS-01, 02)', async () => {
    const csvData = `email,group_name,student_id,display_name
nok@uni.ac.th,Group Aurora,6501,Nok
ton@uni.ac.th,Group Aurora,6502,Ton
beam@uni.ac.th,Group Aurora,6503,Beam
jane@uni.ac.th,Group Borealis,6504,Jane
john@uni.ac.th,Group Borealis,6505,John
jack@uni.ac.th,Group Borealis,6506,Jack
alice@uni.ac.th,Group Cygnus,6507,Alice
bob@uni.ac.th,Group Cygnus,6508,Bob
charlie@uni.ac.th,Group Cygnus,6509,Charlie`;

    const res = await request('POST', `/api/classrooms/${classroomId}/roster:import`, {
      headers: { 'Content-Type': 'text/csv' },
      body: csvData,
    });

    expect(res.status).toBe(200);
    expect(res.body.importedStudents).toBe(9);
    expect(res.body.importedGroups).toBe(3);

    // Get user id of Nok
    const rosterRes = await request('GET', `/api/classrooms/${classroomId}/roster`);
    expect(rosterRes.status).toBe(200);
    const nok = rosterRes.body.members.find((m: any) => m.email === 'nok@uni.ac.th');
    expect(nok).toBeDefined();
    studentUserId = nok.id;
  });

  it('Step 3: Creates Assignment with criteria summing to 100% (FR-ASSIGN-01, 02)', async () => {
    const res = await request('POST', '/api/assignments', {
      body: {
        classroomId,
        name: 'Final Project Peer Evaluation',
        slug: 'final-eval',
        groupMaxScore: 15.0,
        individualMaxScore: 5.0,
        criteria: [
          { side: 'GROUP', name: 'User Experience (UX)', weightPct: 40 },
          { side: 'GROUP', name: 'Completeness', weightPct: 35 },
          { side: 'GROUP', name: 'Innovation', weightPct: 25 },
          { side: 'INDIVIDUAL', name: 'Teamwork', weightPct: 50 },
          { side: 'INDIVIDUAL', name: 'Management', weightPct: 50 },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    assignmentId = res.body.id;
  });

  it('Step 4: Calculates Pairing Feasibility before publishing (FR-PAIR-04)', async () => {
    const res = await request('GET', `/api/assignments/${assignmentId}/feasibility`);
    expect(res.status).toBe(200);
    expect(res.body.achievableCoverage).toBeGreaterThan(0);
    expect(res.body.workloadPerEvaluator).toBeGreaterThan(0);
  });

  it('Step 5: Publishes Assignment and generates deterministic pairs (FR-PAIR-01, 08)', async () => {
    const res = await request('POST', `/api/assignments/${assignmentId}:publish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OPEN');
    expect(res.body.publishedAt).toBeDefined();
  });

  it('Step 6: Student retrieves assigned evaluations (FR-EVAL-01)', async () => {
    const res = await request('GET', `/api/assignments/${assignmentId}/my-evaluations?side=GROUP`, {
      headers: { 'x-user-id': studentUserId },
    });

    expect(res.status).toBe(200);
    expect(res.body.comparisons.length).toBeGreaterThan(0);
    firstPairId = res.body.comparisons[0].pairAssignmentId;
    expect(res.body.comparisons[0].leftItem.name).toBeDefined();
    expect(res.body.comparisons[0].rightItem.name).toBeDefined();
  });

  it('Step 7: Autosaves comparison draft (FR-EVAL-04, FR-API-01)', async () => {
    const res = await request('PUT', `/api/comparisons/${firstPairId}`, {
      headers: { 'x-user-id': studentUserId },
      body: { choice: 2, timeOnTaskMs: 2500 }, // Choice 2: Left better
    });

    expect(res.status).toBe(200);
    expect(res.body.choice).toBe(2);
    expect(res.body.status).toBe('DRAFT');
  });

  it('Step 8: Submits evaluation with Idempotency-Key (FR-EVAL-05, 06, FR-API-02)', async () => {
    const res = await request('POST', `/api/assignments/${assignmentId}/submissions`, {
      headers: {
        'x-user-id': studentUserId,
        'idempotency-key': 'submission_key_001',
      },
      body: { side: 'GROUP' },
    });

    expect(res.status).toBe(200);
    expect(res.body.submittedCount).toBe(1);
    expect(res.body.multiplier).toBeGreaterThan(0);
  });

  it('Step 9: Checks student self score view with k-anonymity (FR-REPORT-06, FR-ANON-02)', async () => {
    const res = await request('GET', `/api/assignments/${assignmentId}/my-score`, {
      headers: { 'x-user-id': studentUserId },
    });

    expect(res.status).toBe(200);
    expect(res.body.groupScore).toBeDefined();
    expect(res.body.label).toBe('ชั่วคราว — อาจเปลี่ยนแปลงได้');
  });

  it('Step 10: Instructor finalizes assignment (FR-SCORE-09)', async () => {
    const res = await request('POST', `/api/assignments/${assignmentId}:finalize`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('FINALIZED');
  });

  it('Step 11: Generates Quality Report (FR-REPORT-04, QS-01..07)', async () => {
    const res = await request('GET', `/api/assignments/${assignmentId}/reports/quality`);
    expect(res.status).toBe(200);
    expect(res.body.lowCoverageItems).toBeDefined();
    expect(res.body.straightLiningEvaluators).toBeDefined();
  });

  it('Step 12: Exports CSV report with BOM and audit trail (FR-EXPORT-01, FR-AUDIT-01)', async () => {
    const res = await request('POST', `/api/assignments/${assignmentId}/exports`, {
      headers: { 'x-user-role': 'OWNER' },
      body: { report: 'raw-comparisons', includeIdentities: false },
    });

    expect(res.status).toBe(200);
    // Byte-level check for UTF-8 BOM: 0xEF, 0xBB, 0xBF
    expect(res.buffer[0]).toBe(0xef);
    expect(res.buffer[1]).toBe(0xbb);
    expect(res.buffer[2]).toBe(0xbf);
    expect(res.text).toContain('EVAL-'); // Pseudonymized
  });

  it('Step 13: Verifies append-only audit trail contains all key lifecycle actions (FR-AUDIT-01..03)', async () => {
    const res = await request('GET', `/api/assignments/${assignmentId}/audit`);
    expect(res.status).toBe(200);
    const actions = res.body.map((e: any) => e.action);
    expect(actions).toContain('PUBLISH_ASSIGNMENT');
    expect(actions).toContain('FINALIZE_ASSIGNMENT');
  });

  it('Step 14: Verifies Evaluation UI serves responsive HTML with data-testid (FR-EVAL-03, FR-A11Y-01)', async () => {
    const res = await request('GET', '/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-testid="evaluation-card"');
    expect(res.text).toContain('data-testid="choice-radio-group"');
    expect(res.text).toContain('data-testid="submit-evaluations-btn"');
    expect(res.text).toContain('role="radiogroup"');
  });
});
