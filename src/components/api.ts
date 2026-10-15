export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "ระบบขัดข้อง");
  return data as T;
}
export function dateText(value: string) {
  return new Date(value).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export const statusLabel: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  PUBLISHED: "รอเปิด",
  OPEN: "กำลังประเมิน",
  CLOSED: "ปิดรับแล้ว",
  FINALIZED: "ยืนยันคะแนนแล้ว",
  ARCHIVED: "เก็บถาวร",
};
