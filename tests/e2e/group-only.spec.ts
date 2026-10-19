import { test, expect } from "./fixtures/pilot";
import AxeBuilder from "@axe-core/playwright";

test("teacher creates a group-only assignment and a student finishes without missing individual work", async ({ page, pilot }, info) => {
  await pilot.login(pilot.owner);
  await page.goto(`/classrooms/${pilot.classroomId}`);
  await page.getByText("＋ สร้างงานประเมิน", { exact: true }).click();
  await page.getByLabel("ชื่องาน", { exact: true }).fill("งานกลุ่มเท่านั้น");
  const localDate = (offset: number) => {
    const date = new Date(Date.now() + offset);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  await page.locator('input[name="opensAt"]').fill(localDate(-60000));
  await page.locator('input[name="closesAt"]').fill(localDate(3600000));
  await page.getByTestId("individual-max-score").fill("0");
  await expect(page.getByRole("heading", { name: "เกณฑ์รายบุคคล" })).toHaveCount(0);
  // Switching back restores the teacher's criteria before turning the side off again.
  await page.getByTestId("individual-max-score").fill("5");
  await expect(page.getByRole("heading", { name: "เกณฑ์รายบุคคล" })).toBeVisible();
  await page.getByTestId("individual-max-score").fill("0");
  await page.getByRole("button", { name: "บันทึกฉบับร่าง", exact: true }).click();
  const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name: "งานกลุ่มเท่านั้น", exact: true }) });
  const id = (await card.getAttribute("href"))!.split("/").at(-1)!;
  await card.click();
  await expect(page.getByRole("tab", { name: "ประเมินรายบุคคล", exact: true })).toHaveCount(0);
  await pilot.service.publish(pilot.context(pilot.owner), id, { acceptReducedCoverage: true });
  await pilot.login(pilot.student);
  await page.goto(`/assignments/${id}`);
  await expect(page.getByTestId("my-progress-INDIVIDUAL")).toContainText("ปิดการประเมินรายบุคคล");
  await expect(page.getByRole("tab", { name: "ประเมินเพื่อน", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "ประเมินกลุ่ม", exact: true }).click();
  await page.getByTestId("choice-3").check();
  await expect(page.getByTestId("my-progress-GROUP")).toContainText("ประเมินครบแล้ว รอกดส่ง");
  await page.getByTestId("submit-evaluations-btn").click();
  await expect(page.getByTestId("my-progress-GROUP")).toContainText("ส่งครบแล้ว");
  await page.screenshot({ path: info.outputPath("group-only-complete.png"), fullPage: true });
  await page.goto("/dashboard");
  await expect(page.locator(`a[href="/assignments/${id}"]`).getByTestId("my-progress-INDIVIDUAL")).toContainText("ปิดการประเมินรายบุคคล");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
});
