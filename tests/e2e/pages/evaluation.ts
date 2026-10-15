import type { Page } from "@playwright/test";
export class EvaluationPage {
  constructor(readonly page: Page) {}
  async open(assignmentId: string) {
    await this.page.goto(`/assignments/${assignmentId}`);
    await this.page
      .getByRole("tab", { name: "ประเมินกลุ่ม", exact: true })
      .click();
  }
  async choose(value: number) {
    await this.page.getByTestId(`choice-${value}`).check();
  }
  async submit() {
    await this.page.getByTestId("submit-evaluations-btn").click();
  }
}
