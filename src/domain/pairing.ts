import { createRng, hashSeed } from "../core/pairing/pairing-engine";
import type { Group, Student, PairAssignment } from "../core/types";

type Edge = { to: number; reverse: number; capacity: number; initial: number };
/** Feasible circulation with lower bounds: each pair has R votes, each evaluator floor/ceil workload. */
function allocate(
  evaluators: string[],
  items: string[],
  eligible: (e: string, a: string, b: string) => boolean,
  target: number,
  maxWorkload: number,
  seed: string,
) {
  const rng = createRng(hashSeed(seed)),
    people = rng.shuffle([...evaluators].sort()),
    combinations: { a: string; b: string }[] = [];
  const ordered = [...items].sort();
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++)
      combinations.push({ a: ordered[i], b: ordered[j] });
  const pairs = rng.shuffle(combinations);
  if (!people.length || !pairs.length)
    return {
      coverage: 0,
      work: [] as { evaluator: string; a: string; b: string; left: string }[],
    };
  for (let coverage = target; coverage > 0; coverage--) {
    const total = pairs.length * coverage,
      lower = Math.floor(total / people.length),
      upper = Math.ceil(total / people.length);
    if (upper > maxWorkload) continue;
    const source = 0,
      personStart = 1,
      pairStart = personStart + people.length,
      sink = pairStart + pairs.length,
      superSource = sink + 1,
      superSink = sink + 2;
    const graph: Edge[][] = Array.from({ length: superSink + 1 }, () => []),
      demand = Array(superSink + 1).fill(0) as number[];
    const edge = (from: number, to: number, lo: number, hi: number) => {
      const forward: Edge = {
        to,
        reverse: graph[to].length,
        capacity: hi - lo,
        initial: hi - lo,
      };
      graph[from].push(forward);
      graph[to].push({
        to: from,
        reverse: graph[from].length - 1,
        capacity: 0,
        initial: 0,
      });
      demand[from] -= lo;
      demand[to] += lo;
      return forward;
    };
    edge(sink, source, 0, total);
    people.forEach((_, i) => edge(source, personStart + i, lower, upper));
    pairs.forEach((_, j) => edge(pairStart + j, sink, coverage, coverage));
    const choices: { evaluator: string; a: string; b: string; edge: Edge }[] =
      [];
    people.forEach((evaluator, i) =>
      pairs.forEach((p, j) => {
        if (eligible(evaluator, p.a, p.b))
          choices.push({
            evaluator,
            ...p,
            edge: edge(personStart + i, pairStart + j, 0, 1),
          });
      }),
    );
    let required = 0;
    for (let v = 0; v <= sink; v++)
      if (demand[v] > 0) {
        edge(superSource, v, 0, demand[v]);
        required += demand[v];
      } else if (demand[v] < 0) edge(v, superSink, 0, -demand[v]);
    let flow = 0;
    for (;;) {
      const level = Array(graph.length).fill(-1) as number[],
        queue = [superSource];
      level[superSource] = 0;
      for (let i = 0; i < queue.length; i++)
        for (const e of graph[queue[i]])
          if (e.capacity > 0 && level[e.to] < 0) {
            level[e.to] = level[queue[i]] + 1;
            queue.push(e.to);
          }
      if (level[superSink] < 0) break;
      const cursor = Array(graph.length).fill(0) as number[];
      const send = (v: number, amount: number): number => {
        if (v === superSink) return amount;
        for (; cursor[v] < graph[v].length; cursor[v]++) {
          const e = graph[v][cursor[v]];
          if (e.capacity > 0 && level[e.to] === level[v] + 1) {
            const sent = send(e.to, Math.min(amount, e.capacity));
            if (sent) {
              e.capacity -= sent;
              graph[e.to][e.reverse].capacity += sent;
              return sent;
            }
          }
        }
        return 0;
      };
      for (
        let sent = send(superSource, required);
        sent > 0;
        sent = send(superSource, required)
      )
        flow += sent;
    }
    if (flow === required)
      return {
        coverage,
        work: choices
          .filter((c) => c.edge.capacity === 0)
          .map(({ evaluator, a, b }) => ({
            evaluator,
            a,
            b,
            left: rng.coinFlip() ? a : b,
          })),
      };
  }
  return {
    coverage: 0,
    work: [] as { evaluator: string; a: string; b: string; left: string }[],
  };
}

export function balancedGroupPairs(p: {
  assignmentId: string;
  criterionId: string;
  groups: Group[];
  students: Student[];
  seed: string;
  targetCoverage: number;
  maxWorkload: number;
  generation: number;
}) {
  const groupByStudent = new Map(p.students.map((s) => [s.id, s.groupId]));
  const result = allocate(
    p.students.map((s) => s.id),
    p.groups.map((g) => g.id),
    (e, a, b) => groupByStudent.get(e) !== a && groupByStudent.get(e) !== b,
    p.targetCoverage,
    p.maxWorkload,
    `${p.seed}:${p.criterionId}`,
  );
  const feasibility = {
    feasible: result.coverage === p.targetCoverage,
    achievableCoverage: result.coverage,
    targetCoverage: p.targetCoverage,
    workloadPerEvaluator: p.students.length
      ? Math.ceil(result.work.length / p.students.length)
      : 0,
    totalComparisons: result.work.length,
    constraintViolations:
      result.coverage === p.targetCoverage
        ? []
        : ["Coverage reduced to satisfy eligibility and workload balance"],
    message: result.coverage
      ? `จัดคู่ได้ ${result.coverage} ครั้งต่อคู่ (เป้าหมาย ${p.targetCoverage}) ภาระงานไม่เกิน ${p.students.length ? Math.ceil(result.work.length / p.students.length) : 0} คู่ต่อคนต่อเกณฑ์`
      : "ไม่มีการจัดคู่ที่รักษาสิทธิ์และภาระงานสมดุลได้ เพิ่มกลุ่มหรือปรับขนาดกลุ่ม",
  };
  const pairAssignments: PairAssignment[] = result.work.map((w, i) => ({
    id: `${p.assignmentId}:${p.criterionId}:${i}`,
    assignmentId: p.assignmentId,
    criterionId: p.criterionId,
    side: "GROUP",
    itemAId: w.a,
    itemBId: w.b,
    evaluatorUserId: w.evaluator,
    displayLeftItemId: w.left,
    generation: p.generation,
  }));
  return { pairAssignments, feasibility };
}
export function balancedIndividualPairs(p: {
  assignmentId: string;
  criterionId: string;
  group: Group;
  seed: string;
  maxWorkload: number;
  generation: number;
}) {
  const result = allocate(
    p.group.memberIds,
    p.group.memberIds,
    (e, a, b) => e !== a && e !== b,
    Math.max(0, p.group.memberIds.length - 2),
    p.maxWorkload,
    `${p.seed}:${p.group.id}:${p.criterionId}`,
  );
  return {
    coverage: result.coverage,
    pairAssignments: result.work.map(
      (w, i): PairAssignment => ({
        id: `${p.assignmentId}:${p.criterionId}:${p.group.id}:${i}`,
        assignmentId: p.assignmentId,
        criterionId: p.criterionId,
        side: "INDIVIDUAL",
        itemAId: w.a,
        itemBId: w.b,
        evaluatorUserId: w.evaluator,
        displayLeftItemId: w.left,
        generation: p.generation,
      }),
    ),
  };
}
