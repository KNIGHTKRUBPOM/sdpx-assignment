# ADR-004: A portable Next.js application with PostgreSQL

Status: Accepted for the user-approved pilot plan.
Date: 2026-10-15.

## Context
The repository was an Express/in-memory prototype with a static evaluation page. The existing standard already chose Next.js/PostgreSQL. The user approved a 1–2 week, zero-cost pilot for 30 students and confirmed Google-only login to follow the instructor PRD.

## Decision
Use Next.js App Router and Auth.js Google OAuth. Put authorization and transactional services behind the REST boundary. Persist in PostgreSQL via Drizzle. Use Vercel Hobby and two Supabase Free projects for staging/pilot, with a portable standalone Docker image. Use real PostgreSQL in integration tests and keep existing legacy tests unchanged.

Use per-classroom database row locks to serialize grade-affecting mutations at pilot scale. Keep decimal arithmetic for scoring and immutable numeric final records. Audit uses a separate schema, append-only triggers and runtime permissions. Explicitly defer physically separate audit storage and production recovery/SLA guarantees.

## Alternatives
- Rebuild everything: rejected because tested pure functions and prior documents remain useful.
- Keep the memory store in production: rejected because restart loses grades and transactions are impossible.
- Separate frontend/backend services: rejected for this delivery window and operating cost.
- SQLite tests: rejected because they do not exercise PostgreSQL locking, JSONB, RLS or trigger behavior.

## Consequences
One deployable app reduces deployment work. Platform secrets and cloud account setup remain necessary. Free Supabase can pause and has no automatic backup/PITR; backup/restore is an explicit operator procedure. A classroom lock can become a throughput bottleneck at larger scale, so 200-user support requires measurements and reevaluation.

## Revisit when
More than 30 concurrent pilot users, strict uptime/RPO requirements, institutional production use, or measured contention fails the latency gates.

## AI-DLC note
The agent proposed retaining the core and replacing the prototype shell. The user approved the plan, requested a separate branch, chose free hosting, and explicitly retained the instructor's Google authentication requirement.
