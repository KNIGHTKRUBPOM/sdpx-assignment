import { memoryStore } from '../storage/memory-store.js';

export function seedDemoData() {
  if (memoryStore.classrooms.size > 0) return;

  const classroomId = 'cls_demo';
  const assignmentId = 'asg_demo';
  const critUxId = 'crit_ux';
  const critCompId = 'crit_comp';

  // 1. Classroom
  memoryStore.classrooms.set(classroomId, {
    id: classroomId,
    name: 'วิชา CE-SDPX Software Development',
    slug: 'ce-sdpx',
    timezone: 'Asia/Bangkok',
    allowedEmailDomains: ['kmitl.ac.th'],
    status: 'ACTIVE',
    createdBy: 'inst_somchai',
    createdAt: new Date(),
  });

  // 2. Groups
  const grpAurora = { id: 'grp_aurora', classroomId, name: 'กลุ่ม Aurora (UX/UI Platform)', createdAt: new Date() };
  const grpBorealis = { id: 'grp_borealis', classroomId, name: 'กลุ่ม Borealis (IoT Smart Farm)', createdAt: new Date() };
  const grpCosmos = { id: 'grp_cosmos', classroomId, name: 'กลุ่ม Cosmos (AI Vision Guard)', createdAt: new Date() };
  memoryStore.groups.set(grpAurora.id, grpAurora);
  memoryStore.groups.set(grpBorealis.id, grpBorealis);
  memoryStore.groups.set(grpCosmos.id, grpCosmos);

  // 3. Users & Members
  const users = [
    { id: 'std_nok', name: 'นก (Aurora)', email: 'nok@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpAurora.id },
    { id: 'std_ton', name: 'ต้น (Aurora)', email: 'ton@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpAurora.id },
    { id: 'std_bob', name: 'บ็อบ (Borealis)', email: 'bob@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpBorealis.id },
    { id: 'std_alice', name: 'อลิซ (Cosmos)', email: 'alice@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpCosmos.id },
    { id: 'inst_somchai', name: 'อ.สมชาย (ผู้สอน)', email: 'somchai@kmitl.ac.th', role: 'OWNER' as const, grpId: null },
  ];

  for (const u of users) {
    memoryStore.users.set(u.id, {
      id: u.id,
      emailRaw: u.email,
      emailNormalized: u.email.toLowerCase(),
      displayName: u.name,
      status: 'ACTIVE',
      createdAt: new Date(),
    });
    memoryStore.classroomMembers.set(`m_${u.id}`, {
      id: `m_${u.id}`,
      classroomId,
      userId: u.id,
      role: u.role,
      groupId: u.grpId,
      joinedAt: new Date(),
    });
  }

  // 4. Assignment
  memoryStore.assignments.set(assignmentId, {
    id: assignmentId,
    classroomId,
    name: 'Final Project Demo & Peer Evaluation',
    slug: 'final-project',
    description: 'การประเมินผลงานกลุ่มและรายบุคคลประจำภาคเรียน',
    artifactUrl: 'https://github.com/CE-SDPX',
    groupMaxScore: 15,
    individualMaxScore: 5,
    groupDeadlineUtc: new Date(Date.now() + 7 * 86400000),
    individualDeadlineUtc: new Date(Date.now() + 7 * 86400000),
    instructorWeight: 1.0,
    targetCoverage: 5,
    maxWorkload: 8,
    minComparisons: 3,
    scoreFloor: 0.6,
    scoreCeiling: 1.0,
    completionThreshold: 0.9,
    pairingSeed: 42,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    finalizedAt: null,
    createdBy: 'inst_somchai',
    createdAt: new Date(),
  });

  // 5. Criteria
  memoryStore.criteria.set(critUxId, {
    id: critUxId,
    side: 'GROUP',
    name: 'User Experience & Accessibility (UX)',
    description: 'ความง่ายในการใช้งาน ความสวยงาม และการรองรับการเข้าถึง',
    weightPct: 60,
  });
  memoryStore.criteria.set(critCompId, {
    id: critCompId,
    side: 'GROUP',
    name: 'Completeness & Code Quality',
    description: 'ความครบถ้วนตามข้อกำหนดและความสะอาดของโค้ด',
    weightPct: 40,
  });

  // 6. Generate Demo Pairs for student Nok (Aurora cannot evaluate Aurora, so Borealis vs Cosmos)
  const pair1 = {
    id: 'pa_demo_1',
    assignmentId,
    criterionId: critUxId,
    side: 'GROUP' as const,
    itemAId: grpBorealis.id,
    itemBId: grpCosmos.id,
    evaluatorUserId: 'std_nok',
    displayLeftItemId: grpBorealis.id,
    generation: 1,
    source: 'AUTO' as const,
    createdAt: new Date(),
  };
  const pair2 = {
    id: 'pa_demo_2',
    assignmentId,
    criterionId: critCompId,
    side: 'GROUP' as const,
    itemAId: grpBorealis.id,
    itemBId: grpCosmos.id,
    evaluatorUserId: 'std_nok',
    displayLeftItemId: grpCosmos.id,
    generation: 1,
    source: 'AUTO' as const,
    createdAt: new Date(),
  };
  memoryStore.pairAssignments.set(pair1.id, pair1);
  memoryStore.pairAssignments.set(pair2.id, pair2);
}
