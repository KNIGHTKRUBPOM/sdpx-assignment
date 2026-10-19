export interface ProgressAnswer { currentChoice: number | null; submittedChoice: number | null }
export function evaluationProgress(answers: ProgressAnswer[]) {
  const total = answers.length, answered = answers.filter((a) => a.currentChoice !== null).length;
  const submitted = answers.filter((a) => a.submittedChoice !== null).length;
  const currentSubmitted = answers.filter((a) => a.submittedChoice !== null && a.currentChoice === a.submittedChoice).length;
  const changed = answers.filter((a) => a.submittedChoice !== null && a.currentChoice !== a.submittedChoice).length;
  return { total, answered, submitted, changed, remaining: total - answered, pending: answered - currentSubmitted, outstanding: total - currentSubmitted };
}
export type EvaluationProgress = ReturnType<typeof evaluationProgress>;
export type MyProgress = Record<"GROUP" | "INDIVIDUAL", EvaluationProgress>;
export function progressLabel(p: EvaluationProgress) {
  if (!p.total) return "ไม่มีคู่ที่ต้องประเมิน";
  if (!p.outstanding) return "ส่งครบแล้ว";
  if (p.changed) return "มีคำตอบแก้ไข ต้องส่งใหม่";
  if (!p.remaining) return "ประเมินครบแล้ว รอกดส่ง";
  return p.submitted ? "ส่งแล้วบางส่วน ยังประเมินไม่ครบ" : p.answered ? "กำลังประเมิน ยังไม่ได้ส่ง" : "ยังไม่ได้เริ่มประเมิน";
}
