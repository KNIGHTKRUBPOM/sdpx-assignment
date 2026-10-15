# Security pre-check

## Concrete fixes

- Prototype accepted client-provided identity/role and defaulted to Owner. Production uses a signed Google OAuth session and server-side classroom membership. Header spoof and cross-classroom integration tests prevent regression.
- Prototype scanned all comparisons in score/export paths. Persistent queries filter assignment and generation, scoring also requires criterion identity. Regression tests use identical item IDs across assignments.
- Draft edits could alter already submitted choices. Database answers now separate drafts and submitted values; revision history is append-only. Tests verify drafts do not affect published inputs.
- Retry keys were global and returned invented participation. Keys now scope to user/assignment, bind side, and retain the actual response transactionally.
- Versionless autosave could silently overwrite newer choices. Expected version plus per-classroom transaction locking rejects conflicts; a concurrent-write test verifies exactly one succeeds.
- Student totals could be misleading while individual scores were hidden. Both inferable individual/total values are omitted below k=3; negative tests cover this.
- Predictable evaluator hashes are replaced in production exports and quality reports by secret-keyed HMAC pseudonyms. Raw export item identities are also pseudonymized, so individual evaluation rows do not expose roster IDs. Owner identity access creates audit records.
- Embedded quote characters in CSV could break escaping. Export doubles quotes and prefixes formula-like cells; regression tests cover both.
- PostgreSQL audit/revisions/final scores/overrides reject mutation. Runtime role has no DDL or destructive grants. RLS blocks default Supabase Data API roles.

## Scans and boundaries

Production dependency audit reported zero known vulnerabilities during local implementation; rerun `npm audit --omit=dev --audit-level=high` in CI. CodeQL and Dependabot configuration is included; remote scan status is recorded separately after push.

Google uses verified email and hosted-domain claims, not a browser-supplied role or hd hint. Account linkage also checks the immutable Google subject. Runtime errors return a generic request ID and never expose SQL/stack traces.

Gitleaks 8.30.1 scans full Git history. The exact historical fingerprint for `submission_key_001` in the original API test is allowlisted: it is a synthetic idempotency key, not a credential. No broad rule or path exclusion is used.

Relevant risks: broken access control (IDOR/classroom scope), cryptographic/identity failures (OAuth/session), and injection/data-integrity errors (CSV/SQL). Remaining release checks: real OAuth account linkage, manual screen reader, deployment secret configuration and independent code review. The pilot has no automatic PDPA retention workflow or formal security certification.
