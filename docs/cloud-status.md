# Cloud setup status — 2026-10-15

- Source: `feature/paireval-pilot`, draft [PR #1](https://github.com/KNIGHTKRUBPOM/sdpx-assignment/pull/1) into `develop`. `main` is unchanged.
- Supabase: [paireval-pilot](https://supabase.com/dashboard/project/hrlltoqjstxewpxbryuf), ref `hrlltoqjstxewpxbryuf`, organization `sdpx`, Free plan, Singapore (`ap-southeast-1`). Two migrations applied; 12 app tables. Function search paths are pinned.
- Runtime role `paireval_app` provisioned with explicit owner approval: SELECT/INSERT/UPDATE on mutable app tables; SELECT/INSERT only on revisions, submissions, scores, overrides and audit events. No superuser, role/database creation, RLS bypass, public-schema CREATE, audit UPDATE or score DELETE. Permissions are recorded in a separate Supabase operational migration; the password was configured without a migration-history entry.
- Transaction pooler connection verified as `paireval_app` through `aws-0-ap-southeast-1.pooler.supabase.com:6543`. No real student records have been imported (users count: 0 at verification). Supabase security advisors returned no notices after provisioning.
- Vercel: `pathornnnnns-projects/paireval-pilot`, project ID `prj_49pVANJrZxTzr8v4Pwq27J9yE8nY`, Hobby plan. First staged production build is READY and `/api/health` returned `{"status":"ok","service":"paireval"}` using authenticated Vercel CLI access.
- Assigned URL: [PairEval pilot](https://paireval-pilot-pathornnnnns-projects.vercel.app). Deployment protection remains enabled. This is not yet a verified student-accessible release.
- Production environment now has `DATABASE_URL` and `NEXTAUTH_SECRET` as Secrets, plus `NEXTAUTH_URL` and `INITIAL_OWNER_EMAILS`. Database credentials were generated in memory and sent directly to the hosting secret manager, with no credential files retained.
- Pending: owner configures Google OAuth `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` directly in Vercel Production secrets; rebuild to include the new environment; verify real university login and the complete classroom workflow. The first deployment predates the database/URL environment updates, so its health response does not prove database connectivity from Vercel.
- Google OAuth Web application redirect URI: `https://paireval-pilot-pathornnnnns-projects.vercel.app/api/auth/callback/google`.
- Initial owner allowlist: `67015105@kmitl.ac.th`. Google authentication must verify the actual account and `kmitl.ac.th` hosted domain.

The user already has another active free project. Do not pause, repurpose or upgrade unrelated projects to create a staging database. Use the local disposable database for automated tests until a separate cloud staging environment has quota and authorization.

The initial schema was applied through Supabase management and recorded in both Supabase migration history and Drizzle's journal table. Future app migrations use the committed Drizzle journal. Secrets are not recorded in repository files; never include password provisioning SQL in a versioned migration.
