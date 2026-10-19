/** Demo identities are fixtures, never passwords or production accounts. */
export const demoAccounts = [
  { email: "teacher@demo.invalid", name: "อาจารย์สาธิต", group: "" },
  ...Array.from({ length: 12 }, (_, i) => ({
    email: `student${String(i + 1).padStart(2, "0")}@demo.invalid`,
    name: `นักศึกษาสาธิต ${String(i + 1).padStart(2, "0")} · กลุ่ม ${Math.floor(i / 4) + 1}`,
    group: `กลุ่ม ${Math.floor(i / 4) + 1}`,
  })),
];

/** Fail closed if someone tries to enable the local identity selector on a cloud DB/site. */
export function demoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DEMO_MODE !== "true") return false;
  try {
    const db = new URL(env.DATABASE_URL ?? ""), site = new URL(env.NEXTAUTH_URL ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"];
    if (!env.VERCEL && !env.VERCEL_ENV && !env.VERCEL_URL &&
      loopback.includes(db.hostname) && db.pathname === "/paireval_demo" &&
      ["postgres:", "postgresql:"].includes(db.protocol) &&
      loopback.includes(site.hostname) && site.protocol === "http:" &&
      site.pathname === "/" && !site.username && !site.password) return true;
  } catch { /* Never include connection strings in the diagnostic. */ }
  throw new Error("Demo requires a loopback site and isolated local paireval_demo database; cloud deployment is prohibited.");
}
