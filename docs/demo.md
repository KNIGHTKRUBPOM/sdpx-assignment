# Local Demo — separate from the deployed classroom system

Requirements: Node.js 22, `npm ci`, Docker Desktop with Engine running. Run `npm run demo` from the repository root. The runner creates a new disposable PostgreSQL database, migrates, seeds synthetic data, builds and starts Next.js. Open **http://localhost:3101/login**. No Google account or password is needed.

- Choose the demo teacher or student 01–12. The banner **DEMO · ข้อมูลสมมติ ไม่ใช่คะแนนจริง** stays visible. Use **สลับบัญชี** to return to the selector; switching reloads the app to clear the previous identity's client state.
- The classroom has 3 groups of 4, one open assignment, artifact links to example.com and no submitted answers. Group coverage falls from the default 5 to 4 explicitly, matching the PRD §8.2 small-class example. Each student has one group pair and three individual pairs.
- For three testers: one handles the teacher, and share students 01–04, 05–08 and 09–12 among yourselves. Select and submit answers for each identity in both evaluation tabs. Merely importing an account never supplies answers on its behalf.
- Below 3 distinct evaluators the individual's score stays hidden. After everyone submits, switch to the teacher to inspect reports, export, close and finalize. Scores and anonymity use the real engines without relaxed thresholds.
- Stop with **Ctrl+C**. The runner stops its own container; its temporary data disappears. Run `npm run demo` again to start fresh. There is no HTTP reset or seed endpoint.
- The database binds only to loopback; the server listens at 127.0.0.1:3101. Use one laptop/shared screen, or independent local runs on each machine (those do not share answers). This is not an online shared demo.

Isolation: `DEMO_MODE=true` is accepted only for a loopback HTTP site and a loopback database named exactly `paireval_demo`. Vercel indicators, cloud hosts and any other database name are rejected. The demo uses fresh random database/session secrets held only in environment variables. The runner never reads the production connection or reuses a production session secret. Google is the only provider when demo is off. Do not set `DEMO_MODE` in Vercel.

PRD trace: FR-AUTH-01 remains enforced in the real app; this selector is a local testing tool, not an alternative production authentication method. FR-SEC-05 forbids production seed/reset endpoints; seeding exists only in a local CLI that refuses non-demo targets. FR-AUTHZ-01/02 and FR-ANON-01/02 are exercised without bypasses.

Automated proof: `npm run test:demo` creates an isolated DB and exercises actual CSRF-protected credential login, account switching, answer submission for all 12 students, anonymity thresholds, reports and finalization. It also rejects unlisted identities. Normal E2E checks assert that the deployed-mode provider list and login screen contain no demo provider.
