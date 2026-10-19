import { test, expect } from "@playwright/test";
import { demoAccounts } from "../../src/demo/config";
import AxeBuilder from "@axe-core/playwright";

test("three people can switch all demo identities, submit both sides and finalize", async ({ page }, testInfo) => {
  const login = async (email: string) => {
    await page.goto("/login");
    await expect(page.getByTestId("google-login")).toHaveCount(0);
    await page.getByTestId("demo-account").selectOption(email);
    await page.getByTestId("demo-login").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("demo-banner")).toBeVisible();
  };
  await login(demoAccounts[0].email);
  const assignmentLink = page.getByRole("link").filter({ has: page.getByRole("heading", { name: "DEMO · ประเมินผลงานและการมีส่วนร่วม" }) });
  const assignmentPath = await assignmentLink.getAttribute("href");
  expect(assignmentPath).toMatch(/^\/assignments\//);
  await expect(page.getByText("＋ สร้างห้องเรียน", { exact: true })).toBeVisible();
  const summary = await page.getByTestId("workspace-summary").innerText();
  expect(summary).toContain("งานที่เปิดประเมิน");
  for (const [index, student] of demoAccounts.slice(1).entries()) {
    await login(student.email);
    await expect(page.getByText("＋ สร้างห้องเรียน", { exact: true })).toHaveCount(0);
    await page.goto(assignmentPath!);
    for (const tab of ["ประเมินกลุ่ม", "ประเมินเพื่อน"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const next = page.getByRole("button", { name: "คู่ถัดไป →", exact: true });
      while (true) {
        await page.getByTestId(`choice-${index % 6 + 1}`).check();
        await expect(page.getByTestId("autosave-status")).toContainText("บันทึกฉบับร่างแล้ว");
        if (await next.isDisabled()) break;
        await next.click();
      }
      await page.getByTestId("submit-evaluations-btn").click();
      await expect(page.getByTestId("autosave-status")).toContainText("ส่งผลประเมินแล้ว");
    }
    if (index === 0) {
      await page.getByRole("tab", { name: "คะแนนของฉัน", exact: true }).click();
      await expect(page.getByText("ยังไม่เปิดเผย", { exact: true })).toHaveCount(2);
    }
  }
  await page.getByRole("tab", { name: "คะแนนของฉัน", exact: true }).click();
  await expect(page.getByText("ยังไม่เปิดเผย", { exact: true })).toHaveCount(0);
  await login(demoAccounts[0].email);
  await page.goto(assignmentPath!);
  await page.getByRole("tab", { name: "รายงานและคะแนน", exact: true }).click();
  await expect(page.getByRole("cell", { name: demoAccounts[1].name, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("demo-reports.png"), fullPage: true });
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole("tab", { name: "ภาพรวม", exact: true }).click();
  await page.getByPlaceholder("เช่น ตรวจสอบข้อมูลครบแล้ว ยืนยันคะแนนสำหรับส่งงาน").fill("จบการสาธิตด้วยบัญชีทดสอบครบทั้งห้อง");
  await page.getByRole("button", { name: "ปิดรับประเมิน", exact: true }).click();
  await expect(page.getByTestId("autosave-status")).toContainText("ปิดรับประเมินแล้ว");
  await page.getByRole("button", { name: "Finalize คะแนน", exact: true }).click();
  await expect(page.getByTestId("autosave-status")).toContainText("ยืนยันคะแนน");
});

test("unlisted accounts cannot create a demo session", async ({ request }) => {
  const csrf = await (await request.get("/api/auth/csrf")).json();
  await request.post("/api/auth/callback/demo", { form: { csrfToken: csrf.csrfToken, email: "outsider@demo.invalid", json: "true", callbackUrl: "/dashboard" } });
  const session = await (await request.get("/api/auth/session")).json();
  expect(session.user).toBeUndefined();
});
