# Tech Stack Standard: PairEval

## Frontend
- **Framework**: Next.js (App Router / React)
- **Language**: TypeScript 5.x (Strict mode)
- **Styling**: Tailwind CSS
- **Design Target**: Mobile-first responsive (≥ 320px viewport, NFR-COMPAT-02)
- **Accessibility**: WCAG 2.2 AA compliant, WAI-ARIA APG Radio Group pattern (FR-A11Y-01)

## Backend & Core Engines
- **Runtime**: Node.js 22+ / ES Modules
- **Language**: TypeScript 5.x with strict type checking
- **Architecture**:
  - Pure function calculation engines for Pairing and Scoring (AR-01)
  - RESTful API layer (PRD §12)
  - Unified error shape (`{ error: { code, message, field, requestId } }`)
- **Database**: PostgreSQL (Prisma or Drizzle ORM) with UTF-8 support; SQLite for unit/integration testing
- **Authorization**: Strict server-side RBAC (Owner, Co-teacher, TA, Student) with classroom scope validation (FR-AUTHZ-01/02)

## Testing Framework & Quality Gates
- **Unit & Golden Testing**: Vitest 3.x
- **Property-based Testing**: fast-check (for Pairing Invariants INV-1 through INV-5)
- **API Spec Linter**: `@redocly/cli` for OpenAPI 3.1 validation
- **E2E Testing Target**: Playwright (Milestone 2/3)

## Rationale
- **Pure Function Engines (AR-01)**: The Scoring Engine has zero internal mutable state. Given identical input data, re-computation is 100% deterministic and reproducible across time.
- **TypeScript End-to-End**: Prevents type mismatch between client payload and database entities.
- **Vitest & Fast-check**: Extremely fast feedback loop (<2 seconds) with thorough invariant exploration for combinatorial pairing edge cases.
