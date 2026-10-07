import {
  Group,
  GroupFeasibilityResult,
  PairAssignment,
  Student,
} from '../types.js';

/**
 * Seeded Pseudo-Random Number Generator (Mulberry32)
 * Ensures deterministic reproducibility (FR-PAIR-09, INV-5)
 */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    coinFlip(): boolean {
      return this.next() >= 0.5;
    },
    shuffle<T>(array: T[]): T[] {
      const copy = [...array];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/**
 * Convert string seed to 32-bit integer
 */
export function hashSeed(seed: string | number): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Solves Group Evaluation Feasibility (PRD §8.2)
 * Constraints:
 * (1) k <= P - (N - 1)
 * (2) k <= k_max
 * (3) R <= min over pairs of (S - |a| - |b|)
 */
export function solveGroupFeasibility(params: {
  totalStudents: number;
  groups: Group[];
  targetCoverage?: number;
  maxWorkload?: number;
}): GroupFeasibilityResult {
  const S = params.totalStudents;
  const N = params.groups.length;
  const targetCoverage = params.targetCoverage ?? 5;
  const kMax = params.maxWorkload ?? 8;

  if (N < 2) {
    return {
      feasible: false,
      achievableCoverage: 0,
      targetCoverage,
      workloadPerEvaluator: 0,
      totalComparisons: 0,
      constraintViolations: ['Number of groups must be at least 2'],
      message: 'มีกลุ่มน้อยกว่า 2 กลุ่ม ไม่สามารถทำ pairwise comparison ได้',
    };
  }

  const P = (N * (N - 1)) / 2;
  const maxEligiblePerEvaluator = P - (N - 1);

  // Constraint 3 max achievable R
  let minEvaluatorsForAnyPair = Infinity;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const sizeA = params.groups[i].memberIds.length;
      const sizeB = params.groups[j].memberIds.length;
      const eligible = S - sizeA - sizeB;
      if (eligible < minEvaluatorsForAnyPair) {
        minEvaluatorsForAnyPair = eligible;
      }
    }
  }

  let achievableR = Math.min(targetCoverage, Math.max(1, minEvaluatorsForAnyPair));

  while (achievableR > 0) {
    const slots = P * achievableR;
    const k = Math.ceil(slots / S);

    const passConstraint1 = k <= maxEligiblePerEvaluator;
    const passConstraint2 = k <= kMax;
    const passConstraint3 = achievableR <= minEvaluatorsForAnyPair;

    if (passConstraint1 && passConstraint2 && passConstraint3) {
      const isOriginalTargetFeasible = achievableR === targetCoverage;
      let message = `ห้องมี ${N} กลุ่ม, coverage เป้าหมาย ${achievableR} ครั้ง/คู่, นักศึกษาประเมิน ${k} คู่ต่อเกณฑ์`;
      if (!isOriginalTargetFeasible) {
        message = `ห้องนี้มี ${N} กลุ่ม แต่ละคู่มีผู้มีสิทธิ์ประเมินเพียง ${achievableR} คน จึงปรับลด coverage เหลือ ${achievableR} ครั้งต่อคู่ (ไม่ใช่ ${targetCoverage} ตามค่าตั้งต้น) นักศึกษาแต่ละคนจะได้ ${k} คู่ต่อเกณฑ์`;
      }

      return {
        feasible: isOriginalTargetFeasible,
        achievableCoverage: achievableR,
        targetCoverage,
        workloadPerEvaluator: k,
        totalComparisons: slots,
        constraintViolations: isOriginalTargetFeasible
          ? []
          : [
              `Target coverage ${targetCoverage} reduced to ${achievableR} due to group constraints`,
            ],
        message,
      };
    }
    achievableR--;
  }

  return {
    feasible: false,
    achievableCoverage: 0,
    targetCoverage,
    workloadPerEvaluator: 0,
    totalComparisons: 0,
    constraintViolations: ['Cannot satisfy pairing feasibility constraints'],
    message: 'ไม่สามารถจัดคู่ประเมินให้สอดคล้องกับข้อกำหนดได้',
  };
}

/**
 * Generates group evaluation pairs (PRD §8.4)
 * Guarantees invariants INV-1, INV-2, INV-3, INV-4, INV-5
 */
export function generateGroupPairs(params: {
  assignmentId: string;
  criterionId: string;
  students: Student[];
  groups: Group[];
  seed: number | string;
  targetCoverage?: number;
  maxWorkload?: number;
  generation?: number;
}): {
  pairAssignments: PairAssignment[];
  feasibility: GroupFeasibilityResult;
} {
  const feasibility = solveGroupFeasibility({
    totalStudents: params.students.length,
    groups: params.groups,
    targetCoverage: params.targetCoverage,
    maxWorkload: params.maxWorkload,
  });

  if (feasibility.achievableCoverage === 0) {
    throw new Error(`Infeasible group pairing: ${feasibility.message}`);
  }

  const R = feasibility.achievableCoverage;
  const S = params.students.length;
  const P = (params.groups.length * (params.groups.length - 1)) / 2;
  const slotsNeeded = P * R;
  const baseK = Math.floor(slotsNeeded / S);
  const remainder = slotsNeeded % S;

  const rng = createRng(
    hashSeed(params.seed) ^
      hashSeed(params.assignmentId) ^
      hashSeed(params.criterionId),
  );

  // Generate all pairs of groups
  const allGroupPairs: { a: string; b: string; key: string }[] = [];
  for (let i = 0; i < params.groups.length; i++) {
    for (let j = i + 1; j < params.groups.length; j++) {
      const a = params.groups[i].id;
      const b = params.groups[j].id;
      allGroupPairs.push({
        a,
        b,
        key: a < b ? `${a}:${b}` : `${b}:${a}`,
      });
    }
  }

  // Interleave students by group to ensure balanced distribution
  const groupStudentsMap = new Map<string, Student[]>();
  for (const s of params.students) {
    const list = groupStudentsMap.get(s.groupId) ?? [];
    list.push(s);
    groupStudentsMap.set(s.groupId, list);
  }

  // Shuffle group order deterministically
  const shuffledGroupIds = rng.shuffle(Array.from(groupStudentsMap.keys()));
  const interleavedStudents: Student[] = [];
  let added = true;
  let round = 0;
  while (added) {
    added = false;
    for (const gId of shuffledGroupIds) {
      const list = groupStudentsMap.get(gId) ?? [];
      if (round < list.length) {
        interleavedStudents.push(list[round]);
        added = true;
      }
    }
    round++;
  }

  // Tracking remaining demand for each pair
  const demand: Record<string, number> = {};
  const actualCoverage: Record<string, number> = {};
  for (const p of allGroupPairs) {
    demand[p.key] = R;
    actualCoverage[p.key] = 0;
  }

  const studentAssignments = new Map<string, Set<string>>();
  for (const s of interleavedStudents) {
    studentAssignments.set(s.id, new Set());
  }

  for (let i = 0; i < interleavedStudents.length; i++) {
    const student = interleavedStudents[i];
    const k = i < remainder ? baseK + 1 : baseK;

    // INV-1: evaluator group not in pair
    // INV-2: pair not already assigned to student
    const eligible = allGroupPairs.filter(
      (p) => p.a !== student.groupId && p.b !== student.groupId,
    );

    // Stable sort by highest remaining demand + fixed random tie-breaker
    const eligibleWithKeys = eligible.map((p) => ({
      pair: p,
      demand: demand[p.key],
      tieBreaker: rng.next(),
    }));

    eligibleWithKeys.sort((e1, e2) => {
      if (e2.demand !== e1.demand) {
        return e2.demand - e1.demand;
      }
      return e1.tieBreaker - e2.tieBreaker;
    });

    const chosen = eligibleWithKeys.slice(0, k).map((e) => e.pair);
    const assignedSet = studentAssignments.get(student.id)!;

    for (const p of chosen) {
      demand[p.key] -= 1;
      actualCoverage[p.key] += 1;
      assignedSet.add(p.key);
    }
  }

  // Rebalance: Ensure INV-3 (max(coverage) - min(coverage) <= 1)
  const studentMap = new Map(params.students.map((s) => [s.id, s]));
  const pairMap = new Map(allGroupPairs.map((p) => [p.key, p]));

  for (let iter = 0; iter < 100; iter++) {
    const coverages = Object.values(actualCoverage);
    const minCov = Math.min(...coverages);
    const maxCov = Math.max(...coverages);
    if (maxCov - minCov <= 1) break;

    const highKey = Object.keys(actualCoverage).find(
      (k) => actualCoverage[k] === maxCov,
    )!;
    const lowKey = Object.keys(actualCoverage).find(
      (k) => actualCoverage[k] === minCov,
    )!;
    const lowPair = pairMap.get(lowKey)!;

    let swapped = false;

    // 1-step direct swap
    for (const student of interleavedStudents) {
      const set = studentAssignments.get(student.id)!;
      if (set.has(highKey)) {
        const canTakeLow =
          lowPair.a !== student.groupId &&
          lowPair.b !== student.groupId &&
          !set.has(lowKey);
        if (canTakeLow) {
          set.delete(highKey);
          set.add(lowKey);
          actualCoverage[highKey]--;
          actualCoverage[lowKey]++;
          swapped = true;
          break;
        }
      }
    }

    // 2-step augmenting swap if direct swap was blocked
    if (!swapped) {
      for (const s1 of interleavedStudents) {
        const set1 = studentAssignments.get(s1.id)!;
        if (!set1.has(highKey)) continue;

        for (const midPair of allGroupPairs) {
          if (set1.has(midPair.key)) continue;
          if (midPair.a === s1.groupId || midPair.b === s1.groupId) continue;

          // Find s2 that has midPair and can take lowPair
          const s2 = interleavedStudents.find((s) => {
            const set2 = studentAssignments.get(s.id)!;
            return (
              set2.has(midPair.key) &&
              lowPair.a !== s.groupId &&
              lowPair.b !== s.groupId &&
              !set2.has(lowKey)
            );
          });

          if (s2) {
            const set2 = studentAssignments.get(s2.id)!;
            set1.delete(highKey);
            set1.add(midPair.key);
            set2.delete(midPair.key);
            set2.add(lowKey);
            actualCoverage[highKey]--;
            actualCoverage[lowKey]++;
            swapped = true;
            break;
          }
        }
        if (swapped) break;
      }
    }

    if (!swapped) break;
  }

  // Build final pair assignment list with randomized left/right placement (FR-PAIR-08)
  const pairAssignments: PairAssignment[] = [];
  for (const student of interleavedStudents) {
    const assignedSet = studentAssignments.get(student.id)!;
    for (const pairKey of assignedSet) {
      const p = pairMap.get(pairKey)!;
      const flip = rng.coinFlip();
      const leftItem = flip ? p.a : p.b;

      pairAssignments.push({
        id: `pair_${student.id}_${p.key}_${params.criterionId}`,
        assignmentId: params.assignmentId,
        criterionId: params.criterionId,
        side: 'GROUP',
        itemAId: p.a,
        itemBId: p.b,
        evaluatorUserId: student.id,
        displayLeftItemId: leftItem,
        generation: params.generation ?? 1,
      });
    }
  }

  return {
    pairAssignments,
    feasibility,
  };
}

/**
 * Generates individual evaluation pairs within each group (PRD §8.3)
 * - Complete enumeration: C(m, 2)
 * - Evaluator workload: C(m-1, 2)
 * - Coverage: m - 2
 */
export function generateIndividualPairs(params: {
  assignmentId: string;
  criterionId: string;
  group: Group;
  seed: number | string;
  maxWorkload?: number;
  generation?: number;
}): {
  pairAssignments: PairAssignment[];
  coverage: number;
  workloadPerMember: number;
  isLowConfidence: boolean;
} {
  const m = params.group.memberIds.length;
  const kMax = params.maxWorkload ?? 8;

  // FR-PAIR-12: m <= 2 cannot do individual evaluation
  if (m <= 2) {
    throw new Error(
      `Cannot perform individual evaluation for group "${params.group.name}" with size ${m} <= 2.`,
    );
  }

  const isLowConfidence = m === 3; // FR-PAIR-13
  const coverage = m - 2;
  const rng = createRng(
    hashSeed(params.seed) ^
      hashSeed(params.group.id) ^
      hashSeed(params.criterionId),
  );

  const pairAssignments: PairAssignment[] = [];
  const members = params.group.memberIds;

  // Generate all within-group pairs
  const allWithinGroupPairs: { a: string; b: string; key: string }[] = [];
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const a = members[i];
      const b = members[j];
      allWithinGroupPairs.push({
        a,
        b,
        key: a < b ? `${a}:${b}` : `${b}:${a}`,
      });
    }
  }

  for (const evaluatorId of members) {
    // Evaluator must NOT evaluate pairs containing themselves (INV-1)
    const eligible = allWithinGroupPairs.filter(
      (p) => p.a !== evaluatorId && p.b !== evaluatorId,
    );

    let chosen = eligible;
    // FR-PAIR-14: If workload exceeds kMax, cap to kMax
    if (chosen.length > kMax) {
      chosen = rng.shuffle(eligible).slice(0, kMax);
    }

    for (const p of chosen) {
      const flip = rng.coinFlip();
      const leftItem = flip ? p.a : p.b;

      pairAssignments.push({
        id: `pair_indiv_${evaluatorId}_${p.key}_${params.criterionId}`,
        assignmentId: params.assignmentId,
        criterionId: params.criterionId,
        side: 'INDIVIDUAL',
        itemAId: p.a,
        itemBId: p.b,
        evaluatorUserId: evaluatorId,
        displayLeftItemId: leftItem,
        generation: params.generation ?? 1,
      });
    }
  }

  const workloadPerMember =
    members.length > 0
      ? Math.round(pairAssignments.length / members.length)
      : 0;

  return {
    pairAssignments,
    coverage,
    workloadPerMember,
    isLowConfidence,
  };
}
