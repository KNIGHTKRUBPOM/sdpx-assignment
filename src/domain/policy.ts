import { requireRule, type Role } from "./model";

export function effectiveStatus(
  a: { status: string; opensAt: Date; closesAt: Date },
  now = new Date(),
) {
  if (a.status !== "PUBLISHED" && a.status !== "OPEN") return a.status;
  if (now >= a.closesAt) return "CLOSED";
  return now < a.opensAt ? "PUBLISHED" : "OPEN";
}
export function assertOpen(
  a: { status: string; opensAt: Date; closesAt: Date },
  now = new Date(),
) {
  requireRule(
    effectiveStatus(a, now) === "OPEN",
    "EVALUATION_CLOSED",
    "ยังไม่เปิดหรือหมดเวลาประเมินแล้ว",
    409,
  );
}
export const staff: Role[] = ["OWNER", "CO_TEACHER"];
export const rosterStaff: Role[] = ["OWNER", "CO_TEACHER", "TA"];
export function allowedDomain(email: string, domains: string[]) {
  return domains.includes(email.toLowerCase().split("@")[1]);
}
export function safeEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (domain === "gmail.com" || domain === "googlemail.com")
    return `${local.split("+")[0].replaceAll(".", "")}@gmail.com`;
  return `${local}@${domain}`;
}
