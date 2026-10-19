import { test, expect } from "./fixtures/pilot";
import { EvaluationPage } from "./pages/evaluation";
import AxeBuilder from "@axe-core/playwright";

test("WS04 smoke: landing, login and protected routes", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "ทุกผลงานมีคุณค่า",
  );
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png"), fullPage: true });
  await page.getByTestId("login-cta").click();
  await expect(page.getByTestId("google-login")).toBeVisible();
  await expect(page.getByTestId("demo-login")).toHaveCount(0);
  expect((await (await page.request.get("/api/auth/providers")).json()).demo).toBeUndefined();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
test("ST-05/06: autosave survives reload, submit and privacy threshold", async ({
  page,
  pilot,
}, testInfo) => {
  await pilot.login(pilot.student);
  const evaluation = new EvaluationPage(page);
  await evaluation.open(pilot.assignmentId);
  await evaluation.choose(2);
  await expect(page.getByTestId("autosave-status")).toContainText(
    "บันทึกฉบับร่างแล้ว",
  );
  await page.reload();
  await page.getByRole("tab", { name: "ประเมินกลุ่ม", exact: true }).click();
  await expect(page.getByTestId("choice-2")).toBeChecked();
  await evaluation.submit();
  await expect(page.getByTestId("autosave-status")).toContainText(
    "ส่งผลประเมินแล้ว",
  );
  const screenshot = testInfo.outputPath("evaluation-working.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach("Evaluation on real PostgreSQL", {
    path: screenshot,
    contentType: "image/png",
  });
  await page.getByRole("tab", { name: "คะแนนของฉัน", exact: true }).click();
  await expect(page.getByText("ยังไม่เปิดเผย", { exact: true })).toHaveCount(2);
});
test("ST-07: mobile keyboard controls and deadline read-only behavior", async ({
  page,
  pilot,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await pilot.login(pilot.student);
  const evaluation = new EvaluationPage(page);
  await evaluation.open(pilot.assignmentId);
  await page.getByTestId("choice-1").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("autosave-status")).toContainText(
    "บันทึกฉบับร่างแล้ว",
  );
  await expect(page.getByTestId("choice-1")).toBeChecked();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await pilot.service.close(pilot.context(pilot.owner), pilot.assignmentId, {
    reason: "Browser deadline test",
  });
  await page.reload();
  await page.getByRole("tab", { name: "ประเมินกลุ่ม", exact: true }).click();
  await expect(page.getByTestId("choice-1")).toBeDisabled();
  await expect(page.getByTestId("submit-evaluations-btn")).toBeDisabled();
});
test("ST-08: instructor can inspect and download a real CSV", async ({
  page,
  pilot,
}) => {
  await pilot.login(pilot.owner);
  await page.goto(`/assignments/${pilot.assignmentId}`);
  await page.getByRole("tab", { name: "รายงานและคะแนน" }).click();
  await expect(
    page.getByRole("cell", { name: "นักศึกษา 1", exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ดาวน์โหลดคะแนน CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain(".csv");
  expect(await download.failure()).toBeNull();
});
