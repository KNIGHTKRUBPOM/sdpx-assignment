# Refactoring decisions

Accepted: replace the prototype HTTP shell and memory persistence, retain existing tests, use explicit role/scope checks, separate pure scoring/pairing from transactions, and introduce PostgreSQL-backed integration tests before claiming persistence/security.

Rejected: rewriting all business rules, introducing separate microservices, applying Gmail dot normalization to university addresses, or treating a passing static HTML test as evidence of a working evaluation flow.

Evidence-driven change: existing property tests generated equal-sized groups. Production allocation now uses a lower-bound feasible-flow solver, testing unequal sizes and zero-workload evaluators. Coverage is reduced only when the full eligibility/workload constraints require it; individual capped allocations report actual coverage.

Before: src/server/app.ts combined mock authentication, mutable maps, scoring, export and hardcoded HTML. After: App Router handles delivery, src/http centralizes request/error handling, domain services authorize and transact, db defines persistence, and React components implement the real flow. Legacy code remains test-only and is excluded from the deployed entrypoint.

The first browser pass found low-contrast step labels and delayed controlled-radio state updates. Both implementation defects were fixed without weakening the test assertions. Linux Docker exposed missing platform dependencies in the lockfile; the lockfile was regenerated with the container npm version.

Remaining improvement: split the application service by use case when its size impedes review; benchmark classroom lock contention before raising the pilot limit. No speculative distributed queues/cache are added.
