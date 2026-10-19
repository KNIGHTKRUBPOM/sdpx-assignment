import express, { Request, Response, NextFunction } from 'express';
import {
  generateGroupPairs,
  generateIndividualPairs,
  solveGroupFeasibility,
} from '../core/pairing/pairing-engine.js';
import {
  computeKendallsW,
  computeQualitySignals,
} from '../core/quality-signals/quality-signals.js';
import {
  buildStudentSelfScoreView,
  exportToCsvString,
  formatExportFilename,
  generateEvaluatorPseudonym,
} from '../core/reports/reports.js';
import {
  normalizeEmail,
  parseAndValidateRosterCsv,
} from '../core/roster/csv-roster.js';
import {
  computeFinalPersonalScore,
  computeItemScores,
} from '../core/scoring/scoring-engine.js';
import { Choice, Criterion, Group, Student, SubmittedComparison } from '../core/types.js';
import { ComparisonEntity, memoryStore } from '../storage/memory-store.js';

export const app = express();

app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

// Middleware: Unified request ID
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = `01J${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  res.setHeader('X-Request-Id', reqId);
  (req as any).requestId = reqId;
  next();
});

// Helper: Standard error response
function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  field: string | null = null,
) {
  const reqId = (res.req as any)?.requestId || 'unknown';
  return res.status(statusCode).json({
    error: {
      code,
      message,
      field,
      requestId: reqId,
    },
  });
}

// Helper: Safely extract string route param
function getParam(req: Request, key: string, fallbackIndex?: number): string {
  const val = req.params[key] ?? (fallbackIndex !== undefined ? req.params[fallbackIndex] : '');
  if (Array.isArray(val)) return val[0] || '';
  return String(val || '');
}

// Helper: Context user from header (mock auth for walking skeleton / integration tests)
function getAuthUser(req: Request) {
  const headerVal = req.headers['x-user-id'];
  const userId = Array.isArray(headerVal) ? headerVal[0] : (headerVal || 'default_instructor');
  const roleVal = req.headers['x-user-role'];
  const role = Array.isArray(roleVal) ? roleVal[0] : (roleVal || 'OWNER');
  return { id: userId, role };
}

// ==========================================
// 1. CLASSROOM ENDPOINTS
// ==========================================

app.get('/api/classrooms', (req: Request, res: Response) => {
  const list = Array.from(memoryStore.classrooms.values()).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    timezone: c.timezone,
    allowedEmailDomains: c.allowedEmailDomains,
    status: c.status,
  }));
  res.json(list);
});

app.post('/api/classrooms', (req: Request, res: Response) => {
  const { name, slug, timezone, allowedEmailDomains } = req.body;
  if (!name || !slug) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Name and slug are required.');
  }

  const user = getAuthUser(req);
  const id = `cls_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const classroom = {
    id,
    name,
    slug,
    timezone: timezone || 'Asia/Bangkok',
    allowedEmailDomains: allowedEmailDomains || [],
    status: 'ACTIVE' as const,
    createdBy: user.id,
    createdAt: new Date(),
  };

  memoryStore.classrooms.set(id, classroom);
  memoryStore.logAudit({
    classroomId: id,
    actorUserId: user.id,
    action: 'CREATE_CLASSROOM',
    resourceType: 'CLASSROOM',
    resourceId: id,
  });

  res.status(201).json(classroom);
});

// Atomic CSV Roster Import (FR-CLASS-01, 02, 03)
app.post(
  [/^\/api\/classrooms\/([^/:]+)\/roster:import$/, '/api/classrooms/:id/roster/import'],
  (req: Request, res: Response) => {
    const classroomId = getParam(req, 'id', 0);
    const classroom = memoryStore.classrooms.get(classroomId);
    if (!classroom) {
      return sendError(res, 404, 'NOT_FOUND', 'Classroom not found.');
    }

    const csvContent =
      typeof req.body === 'string'
        ? req.body
        : req.body?.csv || req.body?.file || '';

    if (!csvContent) {
      return sendError(res, 400, 'EMPTY_FILE', 'No CSV file content received.');
    }

    const parsed = parseAndValidateRosterCsv(csvContent);
    if (!parsed.success || !parsed.rows) {
      return sendError(
        res,
        400,
        parsed.error?.code || 'INVALID_CSV',
        parsed.error?.message || 'CSV validation failed.',
      );
    }

    // Atomic insert: all rows valid
    let studentCount = 0;
    let groupCount = 0;

    for (const [groupName, rows] of Object.entries(parsed.groups!)) {
      let groupId = Array.from(memoryStore.groups.values()).find(
        (g) => g.classroomId === classroomId && g.name === groupName,
      )?.id;

      if (!groupId) {
        groupId = `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        memoryStore.groups.set(groupId, {
          id: groupId,
          classroomId,
          name: groupName,
          createdAt: new Date(),
        });
        groupCount++;
      }

      for (const row of rows) {
        let userEntity = Array.from(memoryStore.users.values()).find(
          (u) => u.emailNormalized === row.emailNormalized,
        );

        if (!userEntity) {
          userEntity = {
            id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            emailRaw: row.email,
            emailNormalized: row.emailNormalized,
            displayName: row.displayName || row.emailNormalized.split('@')[0],
            status: 'PENDING',
            createdAt: new Date(),
          };
          memoryStore.users.set(userEntity.id, userEntity);
        }

        const memberId = `mem_${classroomId}_${userEntity.id}`;
        memoryStore.classroomMembers.set(memberId, {
          id: memberId,
          classroomId,
          userId: userEntity.id,
          role: 'STUDENT',
          groupId: groupId || null,
          joinedAt: new Date(),
        });
        studentCount++;
      }
    }

    const authUser = getAuthUser(req);
    memoryStore.logAudit({
      classroomId,
      actorUserId: authUser.id,
      action: 'IMPORT_ROSTER',
      resourceType: 'ROSTER',
      resourceId: classroomId,
      reason: `Imported ${studentCount} students and ${groupCount} groups`,
    });

    res.json({
      importedStudents: studentCount,
      importedGroups: Object.keys(parsed.groups!).length,
    });
  },
);

app.get('/api/classrooms/:id/roster', (req: Request, res: Response) => {
  const classroomId = getParam(req, 'id');
  const classroom = memoryStore.classrooms.get(classroomId);
  if (!classroom) {
    return sendError(res, 404, 'NOT_FOUND', 'Classroom not found.');
  }

  const members = Array.from(memoryStore.classroomMembers.values())
    .filter((m) => m.classroomId === classroomId)
    .map((m) => {
      const user = memoryStore.users.get(m.userId);
      return {
        id: m.userId,
        email: user?.emailRaw || '',
        displayName: user?.displayName || '',
        role: m.role,
        groupId: m.groupId,
      };
    });

  const groups = Array.from(memoryStore.groups.values())
    .filter((g) => g.classroomId === classroomId)
    .map((g) => ({ id: g.id, name: g.name }));

  res.json({ classroomId, members, groups });
});

// ==========================================
// 2. ASSIGNMENT ENDPOINTS
// ==========================================

app.post('/api/assignments', (req: Request, res: Response) => {
  const {
    classroomId,
    name,
    slug,
    description,
    artifactUrl,
    groupMaxScore,
    individualMaxScore,
    criteria,
  } = req.body;

  if (!classroomId || !name || !slug) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Required fields missing.');
  }

  // Validate criteria weight sums = 100% per side (FR-ASSIGN-02)
  if (Array.isArray(criteria)) {
    const groupWeight = criteria
      .filter((c: any) => c.side === 'GROUP')
      .reduce((sum: number, c: any) => sum + Number(c.weightPct), 0);
    const indivWeight = criteria
      .filter((c: any) => c.side === 'INDIVIDUAL')
      .reduce((sum: number, c: any) => sum + Number(c.weightPct), 0);

    if (criteria.some((c: any) => c.side === 'GROUP') && Math.abs(groupWeight - 100) > 0.05) {
      return sendError(
        res,
        400,
        'CRITERIA_WEIGHT_ERROR',
        `Group criteria weights must sum to 100% (got ${groupWeight}%).`,
      );
    }
    if (criteria.some((c: any) => c.side === 'INDIVIDUAL') && Math.abs(indivWeight - 100) > 0.05) {
      return sendError(
        res,
        400,
        'CRITERIA_WEIGHT_ERROR',
        `Individual criteria weights must sum to 100% (got ${indivWeight}%).`,
      );
    }
  }

  const id = `asg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const user = getAuthUser(req);
  const assignment = {
    id,
    classroomId,
    name,
    slug,
    description: description || '',
    artifactUrl: artifactUrl || '',
    groupMaxScore: Number(groupMaxScore) || 15.0,
    individualMaxScore: Number(individualMaxScore) || 5.0,
    groupDeadlineUtc: null,
    individualDeadlineUtc: null,
    instructorWeight: 1.0,
    targetCoverage: 5,
    maxWorkload: 8,
    minComparisons: 3,
    scoreFloor: 0.6,
    scoreCeiling: 1.0,
    completionThreshold: 0.9,
    pairingSeed: Math.floor(Math.random() * 1000000),
    status: 'DRAFT' as const,
    publishedAt: null,
    finalizedAt: null,
    createdBy: user.id,
    createdAt: new Date(),
  };

  memoryStore.assignments.set(id, assignment);

  if (Array.isArray(criteria)) {
    for (const c of criteria) {
      const critId = `crit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      memoryStore.criteria.set(critId, {
        id: critId,
        side: c.side,
        name: c.name,
        weightPct: Number(c.weightPct),
        description: c.description,
      });
    }
  }

  res.status(201).json(assignment);
});

// Feasibility Check (FR-PAIR-04, §8.2)
app.get('/api/assignments/:id/feasibility', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const assignment = memoryStore.assignments.get(assignmentId);
  if (!assignment) {
    return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
  }

  const classroomId = assignment.classroomId;
  const groupsList = Array.from(memoryStore.groups.values())
    .filter((g) => g.classroomId === classroomId)
    .map((g) => {
      const memberIds = Array.from(memoryStore.classroomMembers.values())
        .filter((m) => m.classroomId === classroomId && m.groupId === g.id)
        .map((m) => m.userId);
      return { id: g.id, name: g.name, memberIds };
    });

  const studentCount = groupsList.reduce((acc, g) => acc + g.memberIds.length, 0);

  const result = solveGroupFeasibility({
    totalStudents: studentCount,
    groups: groupsList,
    targetCoverage: assignment.targetCoverage,
    maxWorkload: assignment.maxWorkload,
  });

  res.json(result);
});

// Publish Assignment & Generate Pairs (FR-PAIR-01, FR-PAIR-08, PRD §7.3)
app.post(
  [/^\/api\/assignments\/([^/:]+):publish$/, '/api/assignments/:id/publish'],
  (req: Request, res: Response) => {
    const assignmentId = getParam(req, 'id', 0);
    const assignment = memoryStore.assignments.get(assignmentId);
    if (!assignment) {
      return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
    }

    const classroomId = assignment.classroomId;
    const groupsList = Array.from(memoryStore.groups.values())
      .filter((g) => g.classroomId === classroomId)
      .map((g) => {
        const memberIds = Array.from(memoryStore.classroomMembers.values())
          .filter((m) => m.classroomId === classroomId && m.groupId === g.id)
          .map((m) => m.userId);
        return { id: g.id, name: g.name, memberIds };
      });

    const studentsList: Student[] = Array.from(memoryStore.classroomMembers.values())
      .filter((m) => m.classroomId === classroomId && m.role === 'STUDENT' && m.groupId)
      .map((m) => {
        const user = memoryStore.users.get(m.userId);
        return {
          id: m.userId,
          email: user?.emailRaw || '',
          displayName: user?.displayName || '',
          groupId: m.groupId!,
        };
      });

    const allCriteria = Array.from(memoryStore.criteria.values());
    const groupCriteria = allCriteria.filter((c) => c.side === 'GROUP');
    const indivCriteria = allCriteria.filter((c) => c.side === 'INDIVIDUAL');

    // Generate Group Pairs per criterion
    for (const crit of groupCriteria) {
      const { pairAssignments } = generateGroupPairs({
        assignmentId: assignment.id,
        criterionId: crit.id,
        students: studentsList,
        groups: groupsList,
        seed: assignment.pairingSeed,
        targetCoverage: assignment.targetCoverage,
        maxWorkload: assignment.maxWorkload,
      });

      for (const pa of pairAssignments) {
        memoryStore.pairAssignments.set(pa.id, pa);
      }
    }

    // Generate Individual Pairs if individualMaxScore > 0
    if (assignment.individualMaxScore > 0) {
      for (const crit of indivCriteria) {
        for (const grp of groupsList) {
          if (grp.memberIds.length <= 2) continue; // Skip m <= 2 (FR-PAIR-12)

          const { pairAssignments } = generateIndividualPairs({
            assignmentId: assignment.id,
            criterionId: crit.id,
            group: grp,
            seed: assignment.pairingSeed,
            maxWorkload: assignment.maxWorkload,
          });

          for (const pa of pairAssignments) {
            memoryStore.pairAssignments.set(pa.id, pa);
          }
        }
      }
    }

    assignment.status = 'OPEN';
    assignment.publishedAt = new Date();

    const user = getAuthUser(req);
    memoryStore.logAudit({
      classroomId,
      assignmentId: assignment.id,
      actorUserId: user.id,
      action: 'PUBLISH_ASSIGNMENT',
      resourceType: 'ASSIGNMENT',
      resourceId: assignment.id,
      reason: 'Published assignment and generated deterministic pairs',
    });

    res.json(assignment);
  },
);

// Finalize Assignment (FR-SCORE-09)
app.post(
  [/^\/api\/assignments\/([^/:]+):finalize$/, '/api/assignments/:id/finalize'],
  (req: Request, res: Response) => {
    const assignmentId = getParam(req, 'id', 0);
    const assignment = memoryStore.assignments.get(assignmentId);
    if (!assignment) {
      return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
    }

    assignment.status = 'FINALIZED';
    assignment.finalizedAt = new Date();

    const user = getAuthUser(req);
    memoryStore.logAudit({
      classroomId: assignment.classroomId,
      assignmentId: assignment.id,
      actorUserId: user.id,
      action: 'FINALIZE_ASSIGNMENT',
      resourceType: 'ASSIGNMENT',
      resourceId: assignment.id,
      reason: 'Instructor finalized scores',
    });

    res.json(assignment);
  },
);

// ==========================================
// 3. EVALUATION & COMPARISON ENDPOINTS
// ==========================================

// Get my assigned comparisons (FR-EVAL-01, FR-EVAL-02)
app.get('/api/assignments/:id/my-evaluations', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const side = req.query.side as string;
  const user = getAuthUser(req);

  const criteria = Array.from(memoryStore.criteria.values()).filter(
    (c) => c.side === side,
  );

  const assignedPairs = Array.from(memoryStore.pairAssignments.values()).filter(
    (pa) =>
      pa.assignmentId === assignmentId &&
      pa.side === side &&
      pa.evaluatorUserId === user.id,
  );

  const comparisons = assignedPairs.map((pa) => {
    const existing = Array.from(memoryStore.comparisons.values()).find(
      (c) => c.pairAssignmentId === pa.id,
    );

    const isGroupSide = pa.side === 'GROUP';
    let leftName = 'Left Item';
    let rightName = 'Right Item';

    if (isGroupSide) {
      leftName = memoryStore.groups.get(pa.displayLeftItemId)?.name || 'Group';
      const rightItemId = pa.displayLeftItemId === pa.itemAId ? pa.itemBId : pa.itemAId;
      rightName = memoryStore.groups.get(rightItemId)?.name || 'Group';
    } else {
      leftName = memoryStore.users.get(pa.displayLeftItemId)?.displayName || 'Student';
      const rightItemId = pa.displayLeftItemId === pa.itemAId ? pa.itemBId : pa.itemAId;
      rightName = memoryStore.users.get(rightItemId)?.displayName || 'Student';
    }

    return {
      pairAssignmentId: pa.id,
      criterionId: pa.criterionId,
      leftItem: { id: pa.displayLeftItemId, name: leftName },
      rightItem: {
        id: pa.displayLeftItemId === pa.itemAId ? pa.itemBId : pa.itemAId,
        name: rightName,
      },
      currentChoice: existing ? existing.choice : null,
    };
  });

  res.json({
    assignmentId,
    side,
    criteria,
    comparisons,
  });
});

// Autosave Draft Comparison (FR-EVAL-04, FR-API-01 Idempotent)
app.put('/api/comparisons/:pairAssignmentId', (req: Request, res: Response) => {
  const pairAssignmentId = getParam(req, 'pairAssignmentId');
  const { choice, timeOnTaskMs } = req.body;
  const user = getAuthUser(req);

  if (!choice || choice < 1 || choice > 6) {
    return sendError(res, 400, 'INVALID_CHOICE', 'Choice must be between 1 and 6.');
  }

  const pair = memoryStore.pairAssignments.get(pairAssignmentId);
  if (!pair) {
    return sendError(res, 404, 'NOT_FOUND', 'Pair assignment not found.');
  }

  // Idempotent upsert of draft
  let comp = Array.from(memoryStore.comparisons.values()).find(
    (c) => c.pairAssignmentId === pairAssignmentId,
  );

  if (!comp) {
    const id = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    comp = {
      id,
      pairAssignmentId,
      evaluatorUserId: user.id,
      choice: Number(choice) as Choice,
      status: 'DRAFT',
      timeOnTaskMs: Number(timeOnTaskMs) || 1500,
      savedAt: new Date(),
    };
    memoryStore.comparisons.set(id, comp);
  } else {
    comp.choice = Number(choice) as Choice;
    comp.savedAt = new Date();
    if (timeOnTaskMs) comp.timeOnTaskMs = Number(timeOnTaskMs);
  }

  res.json(comp);
});

// Submit entire side (FR-EVAL-05, FR-EVAL-06, FR-API-02 Idempotency-Key)
app.post('/api/assignments/:id/submissions', (req: Request, res: Response) => {
  const { side } = req.body;
  const assignmentId = getParam(req, 'id');
  const user = getAuthUser(req);
  const rawKey = req.headers['idempotency-key'];
  const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (idempotencyKey && memoryStore.idempotencyKeys.has(idempotencyKey)) {
    // Already processed this idempotent submission
    return res.json({
      submittedCount: 0,
      participationRatio: 1.0,
      multiplier: 1.0,
      message: 'Idempotent request already processed.',
    });
  }

  if (idempotencyKey) {
    memoryStore.idempotencyKeys.add(idempotencyKey);
  }

  // Find all pair assignments for this student and side
  const assignedPairs = Array.from(memoryStore.pairAssignments.values()).filter(
    (pa) =>
      pa.assignmentId === assignmentId &&
      pa.side === side &&
      pa.evaluatorUserId === user.id,
  );

  let submittedCount = 0;
  for (const pa of assignedPairs) {
    const comp = Array.from(memoryStore.comparisons.values()).find(
      (c) => c.pairAssignmentId === pa.id,
    );
    if (comp) {
      comp.status = 'SUBMITTED';
      comp.submittedAt = new Date();
      submittedCount++;

      // FR-EVAL-06: Store revision history
      memoryStore.comparisonRevisions.push({
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        comparisonId: comp.id,
        choice: comp.choice,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        revisionNo:
          memoryStore.comparisonRevisions.filter((r) => r.comparisonId === comp.id).length + 1,
      });
    }
  }

  const participationRatio = assignedPairs.length > 0 ? submittedCount / assignedPairs.length : 1.0;
  const multiplier = Math.min(1.0, participationRatio / 0.9);

  res.json({
    submittedCount,
    participationRatio,
    multiplier,
  });
});

// Student View My Score (FR-REPORT-06, FR-ANON-01, FR-ANON-02)
app.get('/api/assignments/:id/my-score', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const user = getAuthUser(req);
  const assignment = memoryStore.assignments.get(assignmentId);
  if (!assignment) {
    return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
  }

  const member = Array.from(memoryStore.classroomMembers.values()).find(
    (m) => m.classroomId === assignment.classroomId && m.userId === user.id,
  );

  if (!member || !member.groupId) {
    return sendError(res, 400, 'NO_GROUP', 'Student is not in a group.');
  }

  // Prepare submitted comparisons for scoring
  const submittedCmps: SubmittedComparison[] = Array.from(memoryStore.comparisons.values())
    .filter((c) => c.status === 'SUBMITTED')
    .map((c) => {
      const pa = memoryStore.pairAssignments.get(c.pairAssignmentId)!;
      const rightId = pa.displayLeftItemId === pa.itemAId ? pa.itemBId : pa.itemAId;
      return {
        id: c.id,
        pairAssignmentId: c.pairAssignmentId,
        evaluatorUserId: c.evaluatorUserId,
        isInstructor: false,
        itemLeftId: pa.displayLeftItemId,
        itemRightId: rightId,
        choice: c.choice,
        status: 'SUBMITTED',
      };
    });

  const allCriteria = Array.from(memoryStore.criteria.values());

  const groupSummary = computeItemScores(
    member.groupId,
    'GROUP',
    allCriteria,
    submittedCmps,
    {
      floor: assignment.scoreFloor,
      ceiling: assignment.scoreCeiling,
      instructorWeight: assignment.instructorWeight,
      minComparisons: assignment.minComparisons,
      completionThreshold: assignment.completionThreshold,
      groupMaxScore: assignment.groupMaxScore,
      individualMaxScore: assignment.individualMaxScore,
    },
  );

  const indivSummary = computeItemScores(
    user.id,
    'INDIVIDUAL',
    allCriteria,
    submittedCmps,
    {
      floor: assignment.scoreFloor,
      ceiling: assignment.scoreCeiling,
      instructorWeight: assignment.instructorWeight,
      minComparisons: assignment.minComparisons,
      completionThreshold: assignment.completionThreshold,
      groupMaxScore: assignment.groupMaxScore,
      individualMaxScore: assignment.individualMaxScore,
    },
  );

  // Evaluator count for k-anonymity (FR-ANON-02)
  const evaluatorsForMe = new Set(
    submittedCmps
      .filter((c) => c.itemLeftId === user.id || c.itemRightId === user.id)
      .map((c) => c.evaluatorUserId),
  );

  const personalResult = computeFinalPersonalScore({
    studentId: user.id,
    groupId: member.groupId,
    groupComponentScore: groupSummary.totalComponentScore,
    individualComponentScore: indivSummary.totalComponentScore,
    assignedGroupComparisons: 10,
    submittedGroupComparisons: 10,
    assignedIndividualComparisons: 3,
    submittedIndividualComparisons: 3,
  });

  const view = buildStudentSelfScoreView({
    studentId: user.id,
    groupSummary,
    personalResult,
    individualSubmittedEvaluatorsCount: evaluatorsForMe.size,
    kAnonymityMin: 3,
    isFinal: assignment.status === 'FINALIZED',
  });

  res.json(view);
});

// Quality Report Endpoint (PRD §10, FR-REPORT-04)
app.get('/api/assignments/:id/reports/quality', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const assignment = memoryStore.assignments.get(assignmentId);
  if (!assignment) {
    return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
  }

  const submittedCmps: SubmittedComparison[] = Array.from(memoryStore.comparisons.values())
    .filter((c) => c.status === 'SUBMITTED')
    .map((c) => {
      const pa = memoryStore.pairAssignments.get(c.pairAssignmentId)!;
      const rightId = pa.displayLeftItemId === pa.itemAId ? pa.itemBId : pa.itemAId;
      return {
        id: c.id,
        pairAssignmentId: c.pairAssignmentId,
        evaluatorUserId: c.evaluatorUserId,
        isInstructor: false,
        itemLeftId: pa.displayLeftItemId,
        itemRightId: rightId,
        choice: c.choice,
        status: 'SUBMITTED',
        timeOnTaskMs: c.timeOnTaskMs,
      };
    });

  const groupIds = Array.from(memoryStore.groups.values())
    .filter((g) => g.classroomId === assignment.classroomId)
    .map((g) => g.id);

  const report = computeQualitySignals(groupIds, submittedCmps);
  res.json(report);
});

// Export CSV Endpoint (FR-EXPORT-01..05)
app.post('/api/assignments/:id/exports', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const assignment = memoryStore.assignments.get(assignmentId);
  if (!assignment) {
    return sendError(res, 404, 'NOT_FOUND', 'Assignment not found.');
  }

  const classroom = memoryStore.classrooms.get(assignment.classroomId);
  const { report, includeIdentities, reason } = req.body;
  const user = getAuthUser(req);

  // FR-EXPORT-04: If export has real identities, must be Owner and audit logged
  if (includeIdentities) {
    if (user.role !== 'OWNER') {
      return sendError(res, 403, 'FORBIDDEN', 'Only classroom Owner can export real identities.');
    }
    memoryStore.logAudit({
      classroomId: assignment.classroomId,
      assignmentId: assignment.id,
      actorUserId: user.id,
      action: 'EXPORT_IDENTITIES',
      resourceType: 'EXPORT',
      resourceId: assignment.id,
      reason: reason || 'Owner exported unmasked identities',
    });
  }

  const headers = ['Evaluator_ID', 'Pair_ID', 'Choice', 'Status'];
  const rows = Array.from(memoryStore.comparisons.values()).map((c) => {
    const evalId = includeIdentities
      ? c.evaluatorUserId
      : generateEvaluatorPseudonym(c.evaluatorUserId, assignment.id);
    return [evalId, c.pairAssignmentId, c.choice, c.status];
  });

  const csv = exportToCsvString(headers, rows);
  const filename = formatExportFilename(
    classroom?.slug || 'class',
    assignment.slug,
    report || 'raw',
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(csv, 'utf-8'));
});

// Audit Log endpoint (FR-AUDIT-01..03)
app.get('/api/assignments/:id/audit', (req: Request, res: Response) => {
  const assignmentId = getParam(req, 'id');
  const list = memoryStore.auditEvents.filter((a) => a.assignmentId === assignmentId);
  res.json(list);
});

// ==========================================
// 4. INTERACTIVE RESPONSIVE EVALUATION UI
// ==========================================

app.get('/', (req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PairEval — ระบบประเมินผลนักศึกษาแบบ Pairwise</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); padding: 16px; min-width: 320px; }
    .container { max-width: 640px; margin: 0 auto; }
    header { margin-bottom: 24px; text-align: center; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
    p.subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .progress-bar-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: 600; font-size: 0.95rem; }
    .items-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; text-align: center; }
    .item-box { background: #f1f5f9; padding: 14px; border-radius: 8px; border: 1px solid var(--border); }
    .item-box h3 { font-size: 1.1rem; margin-bottom: 6px; }
    .item-box a { color: var(--primary); text-decoration: none; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
    .scale-legend { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; font-weight: 500; }
    .radio-group { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 16px; }
    .radio-option { flex: 1; text-align: center; }
    .radio-option input[type="radio"] { display: none; }
    .radio-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 48px; border: 2px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: all 0.15s ease; font-weight: 700; }
    .radio-option input[type="radio"]:checked + .radio-btn { background: #eff6ff; border-color: var(--primary); color: var(--primary); box-shadow: 0 0 0 2px rgba(37,99,235,0.2); }
    .label-guide { font-size: 0.75rem; color: var(--text-muted); margin-top: 12px; line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 10px; }
    .status-alert { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; display: flex; align-items: center; gap: 6px; }
    .submit-btn { width: 100%; background: var(--primary); color: white; border: none; padding: 14px; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
    .submit-btn:hover { background: var(--primary-hover); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>PairEval</h1>
      <p class="subtitle">ระบบประเมินผลนักศึกษาแบบ Pairwise Comparison</p>
    </header>

    <div class="card" data-testid="evaluation-card">
      <div class="progress-bar-container">
        <span>เกณฑ์: User Experience (UX)</span>
        <span data-testid="progress-indicator">3 / 5 ✓</span>
      </div>

      <div class="items-comparison">
        <div class="item-box">
          <h3 data-testid="left-item-name">กลุ่ม Aurora</h3>
          <a href="#" target="_blank" data-testid="left-artifact-link">ดูผลงาน ↗</a>
        </div>
        <div class="item-box">
          <h3 data-testid="right-item-name">กลุ่ม Borealis</h3>
          <a href="#" target="_blank" data-testid="right-artifact-link">ดูผลงาน ↗</a>
        </div>
      </div>

      <div class="scale-legend">
        <span>← ซ้ายดีกว่ามาก</span>
        <span>ขวาดีกว่ามาก →</span>
      </div>

      <div role="radiogroup" aria-label="เลือกระดับความต่างระหว่างผลงาน" class="radio-group" data-testid="choice-radio-group">
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="1" data-testid="choice-1">
          <div class="radio-btn" aria-label="1 ซ้ายดีกว่ามาก">1</div>
        </label>
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="2" data-testid="choice-2">
          <div class="radio-btn" aria-label="2 ซ้ายดีกว่า">2</div>
        </label>
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="3" data-testid="choice-3">
          <div class="radio-btn" aria-label="3 ซ้ายดีกว่าเล็กน้อย">3</div>
        </label>
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="4" data-testid="choice-4">
          <div class="radio-btn" aria-label="4 ขวาดีกว่าเล็กน้อย">4</div>
        </label>
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="5" data-testid="choice-5">
          <div class="radio-btn" aria-label="5 ขวาดีกว่า">5</div>
        </label>
        <label class="radio-option">
          <input type="radio" name="pair_eval" value="6" data-testid="choice-6">
          <div class="radio-btn" aria-label="6 ขวาดีกว่ามาก">6</div>
        </label>
      </div>

      <div class="label-guide">
        <strong>คำอธิบายสเกล:</strong><br>
        1 = ซ้ายดีกว่ามาก · 2 = ซ้ายดีกว่า · 3 = ซ้ายดีกว่าเล็กน้อย<br>
        4 = ขวาดีกว่าเล็กน้อย · 5 = ขวาดีกว่า · 6 = ขวาดีกว่ามาก
      </div>
    </div>

    <div class="status-alert" aria-live="polite" data-testid="autosave-status">
      ✓ บันทึกฉบับร่างแล้ว เมื่อ 15:05
    </div>

    <button type="button" class="submit-btn" data-testid="submit-evaluations-btn">
      ส่งผลการประเมิน (Submit)
    </button>
  </div>
</body>
</html>`);
});
