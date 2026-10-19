import { describe, it, expect } from "vitest";
import { evaluationProgress as progress, progressLabel } from "../src/domain/evaluation-progress";

describe("personal evaluation progress", () => {
  it("does not confuse empty work, drafts, submitted answers and edited submissions", () => {
    expect(progressLabel(progress([]))).toBe("ไม่มีคู่ที่ต้องประเมิน");
    expect(progress([{ currentChoice: null, submittedChoice: null }])).toMatchObject({ remaining: 1, pending: 0, submitted: 0, outstanding: 1 });
    expect(progress([{ currentChoice: 2, submittedChoice: null }])).toMatchObject({ remaining: 0, pending: 1, submitted: 0, outstanding: 1 });
    expect(progressLabel(progress([{ currentChoice: 2, submittedChoice: null }]))).toBe("ประเมินครบแล้ว รอกดส่ง");
    expect(progressLabel(progress([{ currentChoice: 2, submittedChoice: 2 }]))).toBe("ส่งครบแล้ว");
    expect(progress([{ currentChoice: 6, submittedChoice: 2 }])).toMatchObject({ submitted: 1, changed: 1, outstanding: 1, pending: 1 });
    expect(progressLabel(progress([{ currentChoice: 6, submittedChoice: 2 }]))).toBe("มีคำตอบแก้ไข ต้องส่งใหม่");
  });
  it("counts unanswered and unsubmitted work separately in a partial submission", () => {
    expect(progress([{ currentChoice: 1, submittedChoice: 1 }, { currentChoice: 3, submittedChoice: null }, { currentChoice: null, submittedChoice: null }])).toEqual({ total: 3, answered: 2, submitted: 1, changed: 0, remaining: 1, pending: 1, outstanding: 2 });
  });
});
