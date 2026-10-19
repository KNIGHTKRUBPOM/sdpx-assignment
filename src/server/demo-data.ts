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
  const grpNebula = { id: 'grp_nebula', classroomId, name: 'กลุ่ม Nebula (Blockchain Ledger)', createdAt: new Date() };

  memoryStore.groups.set(grpAurora.id, grpAurora);
  memoryStore.groups.set(grpBorealis.id, grpBorealis);
  memoryStore.groups.set(grpCosmos.id, grpCosmos);
  memoryStore.groups.set(grpNebula.id, grpNebula);

  // 3. Users & Members
  const users = [
    { id: 'std_67015155', name: 'ไนท์ (std_67015155)', email: '67015155@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpAurora.id },
    { id: 'std_ton', name: 'ต้น (Aurora)', email: 'ton@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpAurora.id },
    { id: 'std_bob', name: 'บ็อบ (Borealis)', email: 'bob@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpBorealis.id },
    { id: 'std_alice', name: 'อลิซ (Cosmos)', email: 'alice@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpCosmos.id },
    { id: 'std_dave', name: 'เดฟ (Nebula)', email: 'dave@kmitl.ac.th', role: 'STUDENT' as const, grpId: grpNebula.id },
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
    weightPct: 50,
  });
  memoryStore.criteria.set(critCompId, {
    id: critCompId,
    side: 'GROUP',
    name: 'Completeness & Code Quality',
    description: 'ความครบถ้วนตามข้อกำหนดและความสะอาดของโค้ด',
    weightPct: 50,
  });

  // 6. Generate 5 Pairs for evaluator ไนท์ (std_67015155) - ไม่ประเมินกลุ่มตัวเอง (Aurora)
  const evalPairs = [
    {
      id: 'pa_demo_1',
      assignmentId,
      criterionId: critUxId,
      side: 'GROUP' as const,
      itemAId: grpBorealis.id,
      itemBId: grpCosmos.id,
      evaluatorUserId: 'std_67015155',
      displayLeftItemId: grpBorealis.id,
      generation: 1,
      source: 'AUTO' as const,
      createdAt: new Date(),
    },
    {
      id: 'pa_demo_2',
      assignmentId,
      criterionId: critUxId,
      side: 'GROUP' as const,
      itemAId: grpBorealis.id,
      itemBId: grpNebula.id,
      evaluatorUserId: 'std_67015155',
      displayLeftItemId: grpNebula.id,
      generation: 1,
      source: 'AUTO' as const,
      createdAt: new Date(),
    },
    {
      id: 'pa_demo_3',
      assignmentId,
      criterionId: critUxId,
      side: 'GROUP' as const,
      itemAId: grpCosmos.id,
      itemBId: grpNebula.id,
      evaluatorUserId: 'std_67015155',
      displayLeftItemId: grpCosmos.id,
      generation: 1,
      source: 'AUTO' as const,
      createdAt: new Date(),
    },
    {
      id: 'pa_demo_4',
      assignmentId,
      criterionId: critCompId,
      side: 'GROUP' as const,
      itemAId: grpBorealis.id,
      itemBId: grpCosmos.id,
      evaluatorUserId: 'std_67015155',
      displayLeftItemId: grpCosmos.id,
      generation: 1,
      source: 'AUTO' as const,
      createdAt: new Date(),
    },
    {
      id: 'pa_demo_5',
      assignmentId,
      criterionId: critCompId,
      side: 'GROUP' as const,
      itemAId: grpCosmos.id,
      itemBId: grpNebula.id,
      evaluatorUserId: 'std_67015155',
      displayLeftItemId: grpNebula.id,
      generation: 1,
      source: 'AUTO' as const,
      createdAt: new Date(),
    },
  ];

  for (const p of evalPairs) {
    memoryStore.pairAssignments.set(p.id, p);
  }

  // 7. Seed evaluations where Aurora is evaluated by other peers & instructor
  // Pair: Aurora vs Borealis (evaluated by Alice from Cosmos)
  const paAurora1 = {
    id: 'pa_ext_1',
    assignmentId,
    criterionId: critUxId,
    side: 'GROUP' as const,
    itemAId: grpAurora.id,
    itemBId: grpBorealis.id,
    evaluatorUserId: 'std_alice',
    displayLeftItemId: grpAurora.id,
    generation: 1,
    source: 'AUTO' as const,
    createdAt: new Date(),
  };
  memoryStore.pairAssignments.set(paAurora1.id, paAurora1);
  memoryStore.comparisons.set('cmp_ext_1', {
    id: 'cmp_ext_1',
    pairAssignmentId: paAurora1.id,
    evaluatorUserId: 'std_alice',
    choice: 2, // Aurora ดีกว่า -> 0.8
    status: 'SUBMITTED',
    timeOnTaskMs: 4200,
    savedAt: new Date(),
    submittedAt: new Date(),
  });

  // Pair: Aurora vs Cosmos (evaluated by Bob from Borealis)
  const paAurora2 = {
    id: 'pa_ext_2',
    assignmentId,
    criterionId: critCompId,
    side: 'GROUP' as const,
    itemAId: grpAurora.id,
    itemBId: grpCosmos.id,
    evaluatorUserId: 'std_bob',
    displayLeftItemId: grpAurora.id,
    generation: 1,
    source: 'AUTO' as const,
    createdAt: new Date(),
  };
  memoryStore.pairAssignments.set(paAurora2.id, paAurora2);
  memoryStore.comparisons.set('cmp_ext_2', {
    id: 'cmp_ext_2',
    pairAssignmentId: paAurora2.id,
    evaluatorUserId: 'std_bob',
    choice: 1, // Aurora ดีกว่ามาก -> 1.0
    status: 'SUBMITTED',
    timeOnTaskMs: 5100,
    savedAt: new Date(),
    submittedAt: new Date(),
  });
}
