import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth";
import { database } from "../../../db/client";
import { PairEvalService } from "../../../domain/service";
import { handleRequest } from "../../../http/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET)
    return Response.json(
      {
        error: {
          code: "SETUP_REQUIRED",
          message: "ยังไม่ได้ตั้งค่าฐานข้อมูลและ Google login",
          field: null,
          requestId: crypto.randomUUID(),
        },
      },
      { status: 503 },
    );
  const session = await getServerSession(authOptions);
  const user =
    session?.user?.id && session.user.email
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name ?? "",
        }
      : null;
  return handleRequest(
    request,
    user,
    new PairEvalService(
      database(),
      (process.env.INITIAL_OWNER_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      process.env.NEXTAUTH_SECRET,
    ),
  );
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH };
