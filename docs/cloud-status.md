# Cloud setup status — 2026-10-15

- Source: `feature/paireval-pilot`, draft [PR #1](https://github.com/KNIGHTKRUBPOM/sdpx-assignment/pull/1) into `develop`. `main` is unchanged.
- Supabase: [paireval-pilot](https://supabase.com/dashboard/project/hrlltoqjstxewpxbryuf), ref `hrlltoqjstxewpxbryuf`, organization `sdpx`, Free plan, Singapore (`ap-southeast-1`). Two migrations applied; 12 app tables. Function search paths are pinned.
- No real student records have been imported. Runtime provisioning and Vercel/Google connection are separate release steps; the presence of a cloud database is not a working login or a live application.
- Initial owner allowlist: `67015105@kmitl.ac.th`. Google authentication must verify the actual account and `kmitl.ac.th` hosted domain.

The user already has another active free project. Do not pause, repurpose or upgrade unrelated projects to create a staging database. Use the local disposable database for automated tests until a separate cloud staging environment has quota and authorization.

The initial schema was applied through Supabase management and recorded in both Supabase migration history and Drizzle's journal table. Future app migrations use the committed Drizzle journal. Secrets are not recorded in repository files; never include password provisioning SQL in a versioned migration.
