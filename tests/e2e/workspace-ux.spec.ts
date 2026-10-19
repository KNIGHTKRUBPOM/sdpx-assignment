import { test, expect } from "./fixtures/pilot";

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
  await expect(page.getByRole("link", { name: "เปิดผลงานที่บันทึกไว้ ↗" })).toHaveAttribute("href", "https://example.edu/new-artifact");
  expect(dashboardRequests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
});
