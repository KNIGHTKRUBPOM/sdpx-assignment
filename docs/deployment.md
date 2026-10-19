# Deployment and operations

## Accounts and environments

Confirmed initial owner: `67015105@kmitl.ac.th`. First classroom domain: `kmitl.ac.th`. User has Vercel and Supabase accounts; this alone does not give the agent access or supply OAuth/database credentials.

The current pilot uses the existing `paireval-pilot` production project. CI uses disposable local PostgreSQL databases; `develop` does not deploy to that production project. A future hosted staging environment must have a separate Vercel project and database, after checking available free-tier quota. Use Singapore/nearby regions. Google login requires a Google Workspace identity for university addresses (`email_verified` and matching `hd`); Gmail must be explicitly allowed by the classroom.

## Supabase

1. Create PostgreSQL project; obtain admin session/direct connection for migrations and transaction pooler connection for runtime.
2. Set `MIGRATION_DATABASE_URL` in an operator shell; run `npm run db:migrate`.
3. Set a random `APP_DATABASE_PASSWORD` (24+ characters) in the shell and run `npx tsx scripts/provision-runtime.ts`. The script does not print it.
4. Configure runtime `DATABASE_URL` using the `paireval_app` role and Supabase pooler username format for the project. Use the password supplied above. The app role receives only required grants, with no DDL or audit update/delete. RLS is enabled; no access policy is granted to Supabase anon/authenticated REST roles.
5. Confirm the runtime role can create a classroom but cannot update audit/revision/final score rows. Never use admin DB credentials in browser code.

## Google OAuth

1. Configure Google OAuth consent and a Web application client; request only identity/email/profile scopes.
2. Set the exact callback URLs: local `http://localhost:3000/api/auth/callback/google`, staging `https://STAGING_HOST/api/auth/callback/google`, pilot `https://PILOT_HOST/api/auth/callback/google`.
3. In test mode, add the intended test users. Use a stable staging URL; avoid arbitrary preview host callbacks.
4. Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, runtime `DATABASE_URL`, and `INITIAL_OWNER_EMAILS=67015105@kmitl.ac.th` in Vercel environment variables. Do not put secrets in the repository, image or PR.
5. Verify real owner login, roster matching, logout, student login, disallowed-domain rejection and non-member isolation. Automated tests sign test-only sessions and cannot replace this check.

## CI/CD

`feature/*` → PR into `develop` → reviewed promotion to `main` → pilot. Feature branches, PRs and `develop` run CI only. The workflow tests types, lint, OpenAPI, coverage, PostgreSQL behavior, production build, browser flows, performance and Docker build.

See [the Thai CD setup and demo handoff](cd-demo.md). Keep repository variable `DEPLOY_ENABLED` absent/false until the updated workflow is on main and setup is complete. The `production` environment needs `VERCEL_TOKEN` as an environment secret, project/team IDs as environment variables, Required reviewers and a Selected branches rule for `main` only. Disable Vercel Git auto-production deployment so it cannot bypass CI/approval.

After approval, `scripts/release-production.mjs` verifies the environment protections, target IDs and tested commit. It stages a production deployment with `--skip-domain`, checks health, login and Google-only providers using authenticated Vercel curl, rejects stale commits, then promotes that exact build. Vercel builds from the verified source so application secrets remain on Vercel; no environment files are pulled into CI. Actions are pinned to commit SHAs and the deployment CLI is pinned to 64.0.2.

This pipeline does not migrate databases or need `MIGRATION_DATABASE_URL`. Changes under `drizzle/` compared with the currently live deployment's commit stop the release before staging, even if an earlier push was never deployed. Missing production commit metadata also stops release. Prepare a separately reviewed additive migration and compatible release for schema changes; do not bypass the guard or roll back student data. A public health check confirms app reachability only, not database availability or a complete Google login. Verify those through a real account after release.

Enable branch protection on main/develop with required CI `verify` and `container`. Save a screenshot of a deliberately failing PR being blocked, then revert the deliberate break. Do not claim protection is enabled until verified by a repository administrator. The connected GitHub account may have write access without admin access.

## Docker on a server

Use the supplied image behind an HTTPS reverse proxy. Forward port 3000 internally and set `NEXTAUTH_URL` to the public HTTPS origin. Run migrations with an admin credential before starting the new image; runtime uses the restricted role. Do not expose PostgreSQL publicly. Compose is the local development/test convenience configuration; its DB owner connection is not the production runtime credential.

## Backup, restore and rollback

Free Supabase has no automatic backups/PITR. Set an independent random 64-hex `BACKUP_KEY` in the operator environment and retain it in a secret manager. Never lose this key: encrypted backups cannot be recovered without it.

```sh
# Admin DB URL and BACKUP_KEY are already in the shell
npx tsx scripts/backup.ts backup backups/pilot-before-release.enc
# Restore into a NEW empty PostgreSQL database, not the live database
# Set RESTORE_DATABASE_URL, BACKUP_KEY, CONFIRM_RESTORE=EMPTY_DATABASE
# On a new cluster, first run admin SQL: CREATE ROLE paireval_app NOLOGIN;
npx tsx scripts/backup.ts restore backups/pilot-before-release.enc
```

Scripts stream through PostgreSQL 17 Docker tools, encrypt with AES-256-GCM and authenticate before restoring in a single transaction. They back up only the app's public/audit/drizzle schemas and refuse nonempty target app schemas. Supabase managed schemas and existing schema ownership are preserved. Keep backup files outside the repo and store a protected copy away from the development machine. Take a backup before migrations and after each pilot evaluation session; RPO is the time since the last successful backup, not 15 minutes.

Local restore drill: `npx tsx scripts/test-database.ts ops` verifies the restricted role, all 12 table counts, the final snapshot, immutable triggers, tampered-backup rejection and nonempty-target rejection on disposable PostgreSQL. A real Supabase restore drill is still required before release.

Restore drill: use synthetic data, compare counts and final scores, check Google/runtime configuration, then run smoke tests before switching `DATABASE_URL`. SQL grants are not restored; rerun runtime provisioning. For application rollback, redeploy the prior verified commit/image. Prefer additive migrations so older code can still run; never roll the database back blindly over new answers.

## Monitoring and go-live checklist

`/api/health` is liveness only, not a database readiness guarantee. Inspect Vercel request logs and Supabase database utilization around deadlines. Logs contain route patterns, random request IDs, status and duration; they exclude user email, answers, tokens and database URLs. Restore a paused Supabase project before a pilot session. Formal uptime alerting and 200-user capacity remain outside this pilot.

Release only after real OAuth, cross-user negative tests, smoke test with an external participant, backup restore and cloud authorization for student data are recorded. Do not convert an incomplete check into a fabricated pass.
