interface GuideRow {
  criterionId: string; itemAId: string; itemBId: string;
  evaluatorId: string; submittedChoice: number | null;
}
interface GuideStudent { id: string; name: string; groupName: string }
export interface SuggestedPair {
  key: string; criterionId: string; itemAId: string; itemBId: string; label: string;
}
export interface InstructorGuide {
  waitingForSubmissions: number; needsEvaluators: number; suggestions: SuggestedPair[];
}
/** Staff-only guidance; distinct evaluators count across criteria, as in myScore. */
export function instructorGuide(rows: GuideRow[], students: GuideStudent[], criteria: { id: string; name: string }[], teacherId: string): InstructorGuide {
  const assigned = new Map(students.map(s => [s.id, new Set<string>()]));
  const submitted = new Map(students.map(s => [s.id, new Set<string>()]));
  const names = new Map(students.map(s => [s.id, s]));
  const criterionNames = new Map(criteria.map(c => [c.id, c.name]));
  const key = (r: GuideRow) => `${r.criterionId}:${r.itemAId}:${r.itemBId}`;
  const mine = new Set(rows.filter(r => r.evaluatorId === teacherId).map(key));
  const candidates = new Map<string, SuggestedPair>();
  for (const r of rows) {
    for (const studentId of [r.itemAId, r.itemBId]) {
      assigned.get(studentId)?.add(r.evaluatorId);
      if (r.submittedChoice !== null) submitted.get(studentId)?.add(r.evaluatorId);
    }
    if (!mine.has(key(r))) candidates.set(key(r), {
      key: key(r), criterionId: r.criterionId, itemAId: r.itemAId, itemBId: r.itemBId,
      label: `${names.get(r.itemAId)?.groupName} · ${criterionNames.get(r.criterionId)} · ${names.get(r.itemAId)?.name} / ${names.get(r.itemBId)?.name}`,
    });
  }
  return {
    waitingForSubmissions: students.filter(s => submitted.get(s.id)!.size < 3 && assigned.get(s.id)!.size >= 3).length,
    needsEvaluators: students.filter(s => assigned.get(s.id)!.size < 3).length,
    suggestions: [...candidates.values()].filter(r => [r.itemAId, r.itemBId].some(id =>
      assigned.has(id) && assigned.get(id)!.size < 3 && !assigned.get(id)!.has(teacherId))),
  };
}
