# WS1–8 evidence index

- **WS1:** Next.js app, .env.example, setup instructions and deployment workflow prepared. Live URL and commit-to-live timing require actual cloud deployment.
- **WS2:** At least 10 stories/AC in backlog, architecture/ERD, current OpenAPI contract and unit briefs. Link corresponding GitHub Issues after publication.
- **WS3:** Existing tests retained; new engine/policy regression tests and true PRD golden example. Coverage available via CI artifact. Fidelity check executed: changing the 6-point divisor from 5 to 4 fails the golden regression; restoring source passes all six focused tests (`scripts/test-fidelity.ts`).
- **WS4:** Playwright page object and database-backed fixtures; smoke, autosave, mobile/deadline and CSV scenarios passed three consecutive runs (12/12). Google consent is a separate manual check.
- **WS5:** Multi-stage non-root Docker image; dev/test Compose; disposable PostgreSQL; verified Linux clean install. Team-wide setup timing must be measured by the team.
- **WS6:** GitHub Actions with permissions, concurrency, cache and reports. Production environment approval and branch protection must be configured/verified externally. A workflow file alone is not proof.
- **WS7:** k6 stages/thresholds/think-time and automatic 30-user local baseline harness; JSON request logging. 1,764 requests, zero HTTP failures. See `verification.md` and `performance/results/baseline.json`; local results do not certify staging latency.
- **WS8:** Security pre-check, concrete regressions, retained legacy tests, ADR-004, refactoring notes and dependency scan. Team review/understanding must be confirmed by humans.

Do not submit synthetic screenshots, invented loop times, review signatures or live URLs. Reports from local/CI runs must identify the environment and tested commit.
