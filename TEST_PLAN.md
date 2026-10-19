# Test plan

Run unit/legacy regression tests with `npm test`. Run isolated PostgreSQL tests with `npx tsx scripts/test-database.ts integration`. Build first, then run browser tests with `npx tsx scripts/test-database.ts e2e --repeat-each=3`. Tests use disposable Docker databases ending in `_test`; there is no application seed/reset endpoint.

Core requirements: 6-point mapping; decimal scoring by assignment AND criterion; full PRD worked example through real comparisons; actual participation counts; exclusion of drafts; k-anonymity also hides inferable totals; CSV quoting/formula injection; domain-aware identities; deadline boundaries; all five pairing invariants including zero-workload students and unequal group sizes.

Integration requirements: atomic import; classroom roles/scope; spoofed header and Origin rejection; pair ownership; optimistic concurrency; idempotency and revision history; roster lock; immutable snapshot/audit records; persisted data after reconnect; reasoned overrides and scoped exports.

Browser requirements: real database-backed autosave/reload/submit, privacy suppression, mobile keyboard operation, deadline read-only UI, report download, accessibility scans, and protected route redirects. Auth.js sessions are signed only inside test fixtures; the browser suite does not claim to test Google's external consent screen.

Legacy Express is a test harness retained for existing regression tests. The production Next.js entrypoint never imports it. New production integration tests exercise the actual service and HTTP authorization boundary.

Fixtures: generated classrooms/rosters/assignments with test-only users; legacy MemoryStore provides the fake repository. Date boundaries are generated or explicitly pinned in pure unit tests; browser tests do not use hardcoded dates or waitForTimeout.

Manual release checks: actual Google OAuth with owner and student accounts, NVDA/VoiceOver, teacher review of low-confidence flags, restore drill, hosting quota inspection, cloud approval for real student data, production environment reviewer, branch-protection failure demonstration, and external participant completion. Record actual evidence; do not mark these passed from local automated tests.
