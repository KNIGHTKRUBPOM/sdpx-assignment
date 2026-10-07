import {
  AssignmentStatus,
  Choice,
  ComparisonStatus,
  Criterion,
  EvaluationSide,
  PairAssignment,
  Role,
} from '../core/types.js';

export interface UserEntity {
  id: string;
  emailRaw: string;
  emailNormalized: string;
  displayName: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED';
  createdAt: Date;
}

export interface ClassroomEntity {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  allowedEmailDomains: string[];
  status: 'ACTIVE' | 'ARCHIVED';
  createdBy: string;
  createdAt: Date;
}

export interface ClassroomMemberEntity {
  id: string;
  classroomId: string;
  userId: string;
  role: Role;
  groupId: string | null;
  joinedAt: Date;
}

export interface GroupEntity {
  id: string;
  classroomId: string;
  name: string;
  createdAt: Date;
}

export interface AssignmentEntity {
  id: string;
  classroomId: string;
  name: string;
  slug: string;
  description: string;
  artifactUrl: string;
  groupMaxScore: number;
  individualMaxScore: number;
  groupDeadlineUtc: Date | null;
  individualDeadlineUtc: Date | null;
  instructorWeight: number;
  targetCoverage: number;
  maxWorkload: number;
  minComparisons: number;
  scoreFloor: number;
  scoreCeiling: number;
  completionThreshold: number;
  pairingSeed: number;
  status: AssignmentStatus;
  publishedAt: Date | null;
  finalizedAt: Date | null;
  createdBy: string;
  createdAt: Date;
}

export interface ComparisonEntity {
  id: string;
  pairAssignmentId: string;
  evaluatorUserId: string;
  choice: Choice;
  status: ComparisonStatus;
  timeOnTaskMs?: number;
  savedAt: Date;
  submittedAt?: Date;
}

export interface ComparisonRevisionEntity {
  id: string;
  comparisonId: string;
  choice: Choice;
  status: ComparisonStatus;
  submittedAt: Date;
  revisionNo: number;
}

export interface AuditEventEntity {
  id: string;
  classroomId: string;
  assignmentId?: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeJson?: string;
  afterJson?: string;
  reason?: string;
  occurredAt: Date;
}

export class MemoryStore {
  users = new Map<string, UserEntity>();
  classrooms = new Map<string, ClassroomEntity>();
  classroomMembers = new Map<string, ClassroomMemberEntity>();
  groups = new Map<string, GroupEntity>();
  assignments = new Map<string, AssignmentEntity>();
  criteria = new Map<string, Criterion>();
  pairAssignments = new Map<string, PairAssignment>();
  comparisons = new Map<string, ComparisonEntity>();
  comparisonRevisions: ComparisonRevisionEntity[] = [];
  auditEvents: AuditEventEntity[] = []; // FR-AUDIT-01..03 Append-only
  idempotencyKeys = new Set<string>();

  clear() {
    this.users.clear();
    this.classrooms.clear();
    this.classroomMembers.clear();
    this.groups.clear();
    this.assignments.clear();
    this.criteria.clear();
    this.pairAssignments.clear();
    this.comparisons.clear();
    this.comparisonRevisions = [];
    this.auditEvents = [];
    this.idempotencyKeys.clear();
  }

  // FR-AUDIT-01/02/03: Append-only audit logger
  logAudit(event: Omit<AuditEventEntity, 'id' | 'occurredAt'>) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: AuditEventEntity = {
      ...event,
      id,
      occurredAt: new Date(),
    };
    this.auditEvents.push(record);
    return record;
  }
}

export const memoryStore = new MemoryStore();
