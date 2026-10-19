import { test, expect } from "@playwright/test";
import { demoAccounts } from "../../src/demo/config";

test("teacher can receive suggested pairs, submit and follow missing evaluator status", async ({ page }, info) => {
  const login = async (email: string) => {
    await page.goto("/login");
    await page.getByTestId("demo-account").selectOption(email);
    await page.getByTestId("demo-login").click();
    await expect(page).toHaveURL(/\/dashboard$/);
  };
  await login(demoAccounts[0].email);
  const api = async (path: string, method = "GET", data?: unknown) => {
    const response = await page.request.fetch(`/api${path}`, { method, data, headers: { Origin: new URL(page.url()).origin } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const classroom = await api("/classrooms", "POST", { name: "Guide demo", slug: `guide-${Date.now()}`, domains: ["demo.invalid"] });
  const people = demoAccounts.filter((_, i) => [1, 2, 3, 5, 6, 7, 9, 10, 11].includes(i));
  const imported = await page.request.post(`/api/classrooms/${classroom.id}/roster/import`, { data: `email,group_name,display_name\n${people.map(s => `${s.email},${s.group},${s.name}`).join("\n")}`, headers: { Origin: new URL(page.url()).origin, "Content-Type": "text/csv" } });
  expect(imported.ok()).toBe(true);
  const roster = await api(`/classrooms/${classroom.id}/roster`);
  for (const g of roster.groups) await api(`/classrooms/${classroom.id}/groups/${g.id}`, "PATCH", { artifactUrl: "https://example.com/demo" });
  const assignment = await api("/assignments", "POST", { classroomId: classroom.id, name: "Teacher guide", opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 3600000).toISOString(), config: {}, criteria: [{ id: "g", name: "Quality", side: "GROUP", weightPct: 100 }, { id: "i", name: "Teamwork", side: "INDIVIDUAL", weightPct: 100 }] });
  await api(`/assignments/${assignment.id}/publish`, "POST", { acceptReducedCoverage: true });
  await page.goto(`/assignments/${assignment.id}`);
  await expect(page.getByTestId("instructor-guide-counts")).toContainText("ไม่ถึง 3 คน: 9 คน");
  await page.screenshot({ path: info.outputPath("instructor-guide.png"), fullPage: true });
  for (let i = 0; i < 6; i++) {
    await page.getByTestId("instructor-start-suggestion").click();
    await expect(page.getByRole("tab", { name: "ประเมินรายบุคคล", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByTestId("choice-3").check();
    await expect(page.getByTestId("autosave-status")).toContainText("บันทึกฉบับร่างแล้ว");
    await expect(page.getByTestId("my-progress-INDIVIDUAL")).toContainText("บันทึกแล้วรอส่ง 1 คู่");
    await page.getByTestId("submit-evaluations-btn").click();
    await expect(page.getByTestId("autosave-status")).toContainText("ส่งครบในส่วนนี้แล้ว");
  }
  await expect(page.getByTestId("instructor-start-suggestion")).toHaveCount(0);
  await expect(page.getByTestId("instructor-guide-counts")).toContainText("ผู้ประเมินเดิม: 9 คน");
  for (const person of people) {
    await login(person.email);
    await page.goto(`/assignments/${assignment.id}`);
    await expect(page.getByTestId("my-evaluation-progress")).toBeVisible();
    await expect(page.getByTestId("instructor-guide")).toHaveCount(0);
    expect((await api(`/assignments/${assignment.id}`)).instructorGuide).toBeUndefined();
    for (const side of ["GROUP", "INDIVIDUAL"]) {
      const evaluation = await api(`/assignments/${assignment.id}/my-evaluations?side=${side}`);
      for (const pair of evaluation.comparisons) await api(`/comparisons/${pair.pairAssignmentId}`, "PUT", { choice: 3, expectedVersion: 0 });
      const submitted = await page.request.post(`/api/assignments/${assignment.id}/submissions`, { data: { side }, headers: { Origin: new URL(page.url()).origin, "Idempotency-Key": crypto.randomUUID() } });
      expect(submitted.ok()).toBe(true);
    }
  }
  expect((await api(`/assignments/${assignment.id}/my-score`)).individualScore).toBeDefined();
  await login(demoAccounts[0].email);
  await page.goto(`/assignments/${assignment.id}`);
  await expect(page.getByTestId("instructor-guide-counts")).toContainText("ไม่ถึง 3 คน: 0 คน");
  await expect(page.getByTestId("instructor-guide-counts")).toContainText("ผู้ประเมินเดิม: 0 คน");
  await page.reload();
  await expect(page.getByTestId("my-progress-INDIVIDUAL")).toContainText("ส่งครบแล้ว");
});
