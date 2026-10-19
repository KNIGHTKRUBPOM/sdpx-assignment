import { test, expect } from "./fixtures/pilot";
import AxeBuilder from "@axe-core/playwright";

test("errors open an accessible popup, preserve input and return focus on Escape", async ({ page, pilot }, testInfo) => {
  await pilot.login(pilot.owner);
  await page.goto(`/classrooms/${pilot.classroomId}`);
  await page.getByTestId("group-filter").waitFor();
  await page.locator("details summary").filter({ hasText: "Aurora ·" }).click();
  const input = page.locator('input[name="url"]').first();
  await input.fill("https://example.edu/changed-link");
  await page.route("**/api/classrooms/*/groups/*", (route) => route.fulfill({
    status: 409, json: { error: { code: "ROSTER_LOCKED", message: "ลิงก์ผลงานถูกล็อกหลัง publish", requestId: "ux-demo-reference" } },
  }));
  const save = page.getByRole("button", { name: "บันทึกลิงก์", exact: true }).first();
  await save.click();
  const popup = page.getByRole("alertdialog", { name: "ทำรายการไม่สำเร็จ" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("ลิงก์ผลงานถูกล็อกหลัง publish");
  await expect(page.getByTestId("error-dismiss")).toBeFocused();
  await popup.getByText("ข้อมูลสำหรับติดต่อผู้ดูแล", { exact: true }).click();
  await expect(popup).toContainText("ux-demo-reference");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("error-popup.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(popup).not.toBeVisible();
  await expect(input).toHaveValue("https://example.edu/changed-link");
  await expect(save).toBeFocused();
});

test("group filtering and link save show pending state without reloading dashboard", async ({ page, pilot }, testInfo) => {
  const room = await pilot.service.createClassroom(pilot.context(pilot.owner), {
    name: "UX classroom", slug: "ux", domains: ["example.edu"],
  });
  const suffix = crypto.randomUUID();
  await pilot.service.importRoster(pilot.context(pilot.owner), room.id,
    `email,group_name,display_name\na-${suffix}@example.edu,Alpha,Alice\nb-${suffix}@example.edu,Alpha,Bob\nc-${suffix}@example.edu,Beta,Carol\nd-${suffix}@example.edu,Beta,Dan`);
  await pilot.login(pilot.owner);
  await page.goto("/dashboard");
  await page.getByTestId("workspace-summary").waitFor();
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
  let dashboardRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/dashboard")) dashboardRequests++; });
  await page.goto(`/classrooms/${room.id}`);
  await page.getByTestId("group-filter").waitFor();
  await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
  await page.getByTestId("group-filter").selectOption({ label: "Alpha (2 คน)" });
  await expect(page.getByTestId("roster-table").getByRole("row")).toHaveCount(3);
  await page.getByTestId("roster-search").fill("Alice");
  await expect(page.getByTestId("roster-table").getByRole("row")).toHaveCount(2);
  await page.getByText("Alpha · ยังไม่มีลิงก์ผลงาน", { exact: true }).click();
  await page.getByLabel("ลิงก์ผลงาน", { exact: true }).fill("https://example.edu/new-artifact");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/classrooms/*/groups/*", async (route) => { await gate; await route.continue(); });
  await page.getByRole("button", { name: "บันทึกลิงก์", exact: true }).click();
  await expect(page.getByTestId("pending-status")).toContainText("กำลังดำเนินการ");
  await expect(page.getByRole("button", { name: "กำลังบันทึก…" })).toBeDisabled();
  release();
  await expect(page.getByText("บันทึกลิงก์ Alpha แล้ว", { exact: true })).toBeVisible();
  const notification = page.getByTestId("notification-popup");
  await expect(notification).toContainText("บันทึกลิงก์ Alpha แล้ว");
  await expect(notification).toHaveCSS("position", "fixed");
  await expect(page.locator(".alert-live")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("success-popup.png") });
  await expect(page.getByRole("link", { name: "เปิดผลงานที่บันทึกไว้ ↗" })).toHaveAttribute("href", "https://example.edu/new-artifact");
  expect(dashboardRequests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
  await page.getByTestId("notification-dismiss").click();
  await expect(notification).toBeEmpty();
  await expect(page.getByLabel("ลิงก์ผลงาน", { exact: true })).toHaveValue("https://example.edu/new-artifact");
});
