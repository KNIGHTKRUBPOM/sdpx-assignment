import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const target = Object.freeze({
  repository: "KNIGHTKRUBPOM/sdpx-assignment", project: "paireval-pilot",
  projectId: "prj_49pVANJrZxTzr8v4Pwq27J9yE8nY", orgId: "team_Cg6GrtO0xOVjEKm0UVlN6XK9",
  publicUrl: "https://paireval-pilot.vercel.app",
});
const check = (condition, message) => { if (!condition) throw new Error(message); };
export function deploymentUrl(value) {
  const url = new URL(value);
  check(url.protocol === "https:" && url.origin === value && /^paireval-pilot-[a-z0-9-]+\.vercel\.app$/.test(url.hostname), "Unexpected deployment URL");
  return url.origin;
}
async function readJson(url, token) {
  const response = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  check(response.ok, `Release configuration request failed: HTTP ${response.status}`);
  return response.json();
}
function command(program, args) {
  const result = spawnSync(program, args, { encoding: "utf8", timeout: 20 * 60000, maxBuffer: 4 * 1024 * 1024 });
  // Do not echo command output on failure: auth-related diagnostics may contain sensitive data.
  check(result.status === 0, `${program === "git" ? "Git" : "Vercel"} command failed; inspect the Actions step or Vercel deployment build logs`);
  return result.stdout.trim();
}

export async function releaseProduction({ env = process.env, json = readJson, run = command, log = console.log, summary = text => {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
} } = {}) {
  check(env.GITHUB_ACTIONS === "true" && env.GITHUB_EVENT_NAME === "push" && env.GITHUB_REF === "refs/heads/main" && env.GITHUB_REPOSITORY === target.repository,
    "Release requires a push to the original repository's main branch in GitHub Actions");
  check(env.DEPLOY_ENABLED === "true", "DEPLOY_ENABLED must be true");
  for (const key of ["GH_TOKEN", "VERCEL_TOKEN", "VERCEL_CLI_PATH"]) check(env[key], `Missing ${key}; configure production before enabling CD`);
  check(env.VERCEL_PROJECT_ID === target.projectId && env.VERCEL_ORG_ID === target.orgId, "Vercel project/team does not match paireval-pilot");
  check(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ""), "Missing valid release commit");
  check(run("git", ["rev-parse", "HEAD"]) === env.GITHUB_SHA, "Checkout does not match the tested commit");
  check(!run("git", ["status", "--porcelain", "--untracked-files=no"]), "Release checkout has modified tracked files");
  const github = `https://api.github.com/repos/${target.repository}`;
  const configuration = await json(`${github}/environments/production`, env.GH_TOKEN);
  check(configuration.protection_rules?.some(r => r.type === "required_reviewers" && r.reviewers?.length > 0), "production must have Required reviewers");
  check(configuration.deployment_branch_policy?.custom_branch_policies === true, "production must restrict deployments to main");
  const policies = await json(`${github}/environments/production/deployment-branch-policies`, env.GH_TOKEN);
  check(policies.branch_policies?.length === 1 && policies.branch_policies[0].name === "main" && policies.branch_policies[0].type === "branch", "Only the main branch may deploy to production");
  const vercelApi = "https://api.vercel.com";
  const project = await json(`${vercelApi}/v9/projects/${target.projectId}?teamId=${target.orgId}`, env.VERCEL_TOKEN);
  check(project.id === target.projectId && project.accountId === target.orgId && project.name === target.project, "Unexpected Vercel project");
  const previous = project.targets?.production?.url;
  check(previous, "Existing production deployment is required for schema comparison and rollback");
  const previousUrl = deploymentUrl(`https://${previous}`);
  const deployed = await json(`${vercelApi}/v13/deployments/${new URL(previousUrl).hostname}?teamId=${target.orgId}`, env.VERCEL_TOKEN);
  const deployedSha = deployed.meta?.githubCommitSha;
  check(deployed.projectId === target.projectId && /^[a-f0-9]{40}$/.test(deployedSha ?? ""), "Production commit metadata is required before release");
  check(!run("git", ["diff", "--name-only", deployedSha, env.GITHUB_SHA, "--", "drizzle"]),
    "Schema changes since the live deployment require a separately reviewed migration/release; this pipeline never runs migrations");
  const vc = args => run(process.execPath, [env.VERCEL_CLI_PATH, ...args]);
  log(`Staging tested commit ${env.GITHUB_SHA}`);
  // Build on Vercel so application secrets stay on the platform, with no env pull/files.
  const staged = deploymentUrl(vc(["deploy", "--prod", "--skip-domain", "--yes", "--meta", `githubCommitSha=${env.GITHUB_SHA}`]));
  summary(`## Staged production\nCommit: ${env.GITHUB_SHA}\n\nDeployment: ${staged}\n\nPrevious: ${previousUrl}\n\n`);
  const deployment = await json(`${vercelApi}/v13/deployments/${new URL(staged).hostname}?teamId=${target.orgId}`, env.VERCEL_TOKEN);
  check(deployment.projectId === target.projectId && deployment.target === "production" && deployment.readyState === "READY" && deployment.meta?.githubCommitSha === env.GITHUB_SHA,
    "Staged deployment must be READY, production, and match the tested project and commit");
  const curl = path => vc(["curl", `${staged}${path}`, "--", "--fail", "--silent", "--show-error", "--max-time", "30"]);
  const health = JSON.parse(curl("/api/health"));
  check(health.status === "ok" && health.service === "paireval", "Health check failed");
  check(curl("/login").includes("PairEval"), "Login page check failed");
  const providers = JSON.parse(curl("/api/auth/providers"));
  check(Object.keys(providers).length === 1 && providers.google?.type === "oauth", "Production must expose Google only");
  const branch = await json(`${github}/git/ref/heads/main`, env.GH_TOKEN);
  check(branch.object?.sha === env.GITHUB_SHA, "main advanced; release its newer tested commit instead");
  log("Checks passed; promoting the staged production build");
  vc(["promote", staged, "--yes"]);
  // Check public reachability without the Vercel protection bypass used for staged checks.
  const publicHealth = await json(`${target.publicUrl}/api/health`, undefined);
  check(publicHealth.status === "ok" && publicHealth.service === "paireval", "Public health check failed after promotion; inspect and roll back if required");
  summary(`Result: promoted to ${target.publicUrl}\n`);
  log(`Production ready: ${target.publicUrl}`);
  return { staged, previous, commit: env.GITHUB_SHA };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  releaseProduction().catch(error => { console.error(error.message); process.exitCode = 1; });
}
