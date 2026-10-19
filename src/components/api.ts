export class ApiError extends Error {
  constructor(message: string, public code?: string, public requestId?: string) { super(message); }
}
export function errorValue(error: unknown): Error {
  return error instanceof Error ? error : new Error("ระบบขัดข้อง กรุณาลองใหม่");
}
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
  }).catch(() => { throw new ApiError("เชื่อมต่อไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง", "NETWORK_ERROR"); });
  const data = await response.json().catch(() => { throw new ApiError("เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่", "INVALID_RESPONSE", response.headers.get("X-Request-Id") ?? undefined); });
  if (!response.ok) throw new ApiError(data.error?.message || "ระบบขัดข้อง กรุณาลองใหม่", data.error?.code, data.error?.requestId);
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
