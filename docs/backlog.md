# PairEval pilot backlog and acceptance criteria

Target: non-commercial academic submission and a classroom of at most 30 students. Requirement reference: PRD v2.0. UI is Thai; Google OAuth only.

- **ST-01 Google identity and roles** — Given a verified Google account, login links the roster identity; a forged user/role header cannot authenticate. Non-members cannot read a classroom. Evidence: integration `pilot.test.ts`; real Google consent remains a deployment acceptance check.
- **ST-02 Classroom and staff** — An allowlisted instructor creates a classroom and becomes Owner. Only Owner invites Co-teacher/TA. A student cannot elevate their role.
- **ST-03 Roster and artifacts** — Given a valid CSV, all rows are committed; any invalid domain, duplicate or invalid group size rejects the entire import. After publish, roster/artifacts are locked. Evidence: integration import test.
- **ST-04 Assignment and pairing** — Criteria weights sum to 100% per side; publish requires artifact links and confirmation of coverage reduction. No self-review, duplicates or unbalanced workload. Evidence: property tests over unequal groups and deterministic seeds.
- **ST-05 Autosave** — A saved choice survives reload; stale versions fail with 409; another student's pair returns 404. Evidence: integration and browser tests.
- **ST-06 Submission and participation** — Submit records revisions, repeated idempotency keys replay the original result, drafts never replace submitted choices before re-submit. Participation uses actual assigned/submitted counts.
- **ST-07 Deadline and privacy** — At the deadline writes fail and UI is read-only. Below three distinct evaluators both individual and total scores are omitted. Evidence: policy, integration, mobile browser tests.
- **ST-08 Reports and exports** — Staff can review scores/coverage and download UTF-8 BOM CSV. Raw evaluator IDs are HMAC pseudonyms; Owner identity export requires a reason and audit record. Students cannot call report endpoints.
- **ST-09 Finalization and override** — Only Owner finalizes a closed assignment, freezing inputs and outputs. Subsequent submissions fail. Overrides append a reasoned record without rewriting the snapshot. Evidence: database trigger and lifecycle tests.
- **ST-10 Deploy and operations** — Clean install, production build, non-root Docker image, CI gates, PostgreSQL restore, 30-user load measurements and protected production deployment.

Definition of done per story: AC test passes, code review evidence exists, staging flow verified. The source implementation and local tests do not imply the external review/staging checks are complete. Use these IDs in GitHub issues and test names.

Deferred after submission: email, XLSX, appeals, automatic retention, advanced collusion analytics, multi-timezone scheduled recomputation, reopen/regeneration after submissions, and 200-user/SLA certification. Append-only audit uses a separate schema and runtime permissions, not a physically separate datastore.

Decisions: accept PostgreSQL integration tests instead of SQLite to exercise transactions and constraints; accept one deployable Next.js app; reject a full rewrite of tested domain functions; replace the production pairing allocator because the existing balanced-size tests did not prove feasibility for unequal groups.
