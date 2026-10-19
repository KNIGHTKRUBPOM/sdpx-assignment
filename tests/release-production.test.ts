import { describe, expect, it, vi } from "vitest";
import { deploymentUrl, releaseProduction, target } from "../scripts/release-production.mjs";

const sha = "a".repeat(40), staged = "https://paireval-pilot-test-pathornnnnns-projects.vercel.app";
function fixture(change: { schema?: boolean; reviewers?: boolean; policy?: string; project?: string; health?: boolean; demo?: boolean; head?: string; deploymentSha?: string } = {}) {
  const env = {
    GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: target.repository,
    GITHUB_SHA: sha, RELEASE_BASE_SHA: "b".repeat(40), DEPLOY_ENABLED: "true",
    VERCEL_PROJECT_ID: target.projectId, VERCEL_ORG_ID: target.orgId,
    GH_TOKEN: "test-github", VERCEL_TOKEN: "test-vercel", VERCEL_CLI_PATH: "/test/vercel.js",
  };
  const json = vi.fn(async (url: string) => {
    if (url.endsWith("/environments/production")) return { protection_rules: change.reviewers === false ? [] : [{ type: "required_reviewers", reviewers: [{}] }], deployment_branch_policy: { custom_branch_policies: true } };
    if (url.endsWith("/deployment-branch-policies")) return { branch_policies: [{ name: change.policy ?? "main", type: "branch" }] };
    if (url.includes("/v9/projects/")) return { id: change.project ?? target.projectId, name: target.project, accountId: target.orgId, targets: { production: { url: "paireval-pilot-previous.vercel.app" } } };
    if (url.includes("/v13/deployments/paireval-pilot-previous")) return { projectId: target.projectId, meta: { githubCommitSha: "b".repeat(40) } };
    if (url.includes("/v13/deployments/")) return { projectId: target.projectId, target: "production", readyState: "READY", meta: { githubCommitSha: change.deploymentSha ?? sha } };
    if (url.endsWith("/git/ref/heads/main")) return { object: { sha: change.head ?? sha } };
    if (url === `${target.publicUrl}/api/health`) return { status: "ok", service: "paireval" };
    throw new Error("Unexpected API request");
  });
  const run = vi.fn((program: string, args: string[]) => {
    if (program === "git") {
      if (args[0] === "rev-parse") return sha;
      if (args[0] === "diff") return change.schema ? "drizzle/0003_example.sql" : "";
      return "";
    }
    if (args[1] === "deploy") return staged;
    if (args[1] === "promote") return "Promoted";
    if (args[1] === "curl") {
      if (args[2].endsWith("/api/health")) return JSON.stringify({ status: change.health === false ? "error" : "ok", service: "paireval" });
      if (args[2].endsWith("/login")) return "<title>PairEval</title>";
      if (args[2].endsWith("/api/auth/providers")) return JSON.stringify({ google: { type: "oauth" }, ...(change.demo ? { demo: {} } : {}) });
    }
    throw new Error("Unexpected command");
  });
  return { env, json, run, log: vi.fn(), summary: vi.fn() };
}
describe("production release guard", () => {
  it("stages without changing domains, verifies the build, and promotes that exact URL", async () => {
    const deps = fixture();
    expect(await releaseProduction(deps)).toMatchObject({ staged, commit: sha });
    const commands = deps.run.mock.calls.filter(([p]) => p !== "git").map(([, args]) => args);
    expect(commands[0]).toContain("--skip-domain");
    expect(commands[0]).toContain(`githubCommitSha=${sha}`);
    expect(commands.filter(a => a[1] === "curl")).toHaveLength(3);
    expect(commands.at(-1)).toEqual(["/test/vercel.js", "promote", staged, "--yes"]);
    expect(deps.json.mock.calls.at(-1)?.[0]).toBe(`${target.publicUrl}/api/health`);
    expect(deps.run.mock.calls.find(([program, args]) => program === "git" && args[0] === "diff")?.[1])
      .toEqual(["diff", "--name-only", "b".repeat(40), sha, "--", "drizzle"]);
  });
  it.each([
    { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_REF: "refs/heads/develop" }, { GITHUB_REPOSITORY: "someone/fork" },
    { DEPLOY_ENABLED: "false" }, { VERCEL_TOKEN: "" }, { VERCEL_PROJECT_ID: "wrong" },
  ])("rejects unauthorized release contexts before running commands: %j", async change => {
    const deps = fixture();
    Object.assign(deps.env, change);
    await expect(releaseProduction(deps)).rejects.toThrow();
    expect(deps.run).not.toHaveBeenCalled();
  });
  it.each([{ schema: true }, { reviewers: false }, { policy: "develop" }, { project: "wrong" }])("refuses incomplete setup before staging: %j", async change => {
    const deps = fixture(change);
    await expect(releaseProduction(deps)).rejects.toThrow();
    expect(deps.run.mock.calls.some(([, args]) => args[1] === "deploy")).toBe(false);
  });
  it.each([{ health: false }, { demo: true }, { head: "c".repeat(40) }, { deploymentSha: "c".repeat(40) }])("never promotes a failed or stale deployment: %j", async change => {
    const deps = fixture(change);
    await expect(releaseProduction(deps)).rejects.toThrow();
    expect(deps.run.mock.calls.some(([, args]) => args[1] === "promote")).toBe(false);
  });
  it.each(["https://evil.example", "https://other.vercel.app", `${staged}/path`, `https://user:password@${new URL(staged).hostname}`, `${staged}?redirect=evil`])("rejects an unexpected deployment URL: %s", value => {
    expect(() => deploymentUrl(value)).toThrow();
  });
});
