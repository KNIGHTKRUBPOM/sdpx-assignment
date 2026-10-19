import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError, type Context, type Principal } from "../domain/model";
import type { PairEvalService } from "../domain/service";

export async function handleRequest(
  request: Request,
  user: Principal | null,
  service: PairEvalService,
): Promise<Response> {
  const requestId = randomUUID(),
    start = performance.now();
  const url = new URL(request.url),
    path = url.pathname
      .replace(/\/(roster):import$/, "/$1/import")
      .replace(/:([a-z-]+)$/, "/$1");
  const segments = path.split("/").filter(Boolean).slice(1);
  const [resource, entityId, action, subId] = segments;
  const method = request.method;
  let status = 200;
  try {
    if (!user?.id)
      throw new AppError(401, "UNAUTHENTICATED", "กรุณาเข้าสู่ระบบด้วย Google");
    if (!["GET", "HEAD"].includes(method)) {
      const expectedOrigin = new URL(process.env.NEXTAUTH_URL || url.origin)
        .origin;
      if (request.headers.get("origin") !== expectedOrigin)
        throw new AppError(
          403,
          "INVALID_ORIGIN",
          "แหล่งที่มาของคำขอไม่ถูกต้อง",
        );
      if (Number(request.headers.get("content-length") || 0) > 120_000)
        throw new AppError(413, "BODY_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป");
    }
    const ctx: Context = { user, requestId };
    const body = async () => {
      const text = await request.text();
      if (text.length > 120_000)
        throw new AppError(413, "BODY_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป");
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new AppError(400, "INVALID_JSON", "JSON ไม่ถูกต้อง");
      }
    };
    let result: unknown;
    if (resource === "dashboard" && method === "GET")
      result = await service.dashboard(ctx);
    else if (resource === "privacy" && method === "POST")
      result = await service.acceptNotice(ctx);
    else if (resource === "classrooms" && !entityId && method === "GET")
      result = (await service.dashboard(ctx)).classrooms;
    else if (resource === "classrooms" && !entityId && method === "POST") {
      result = await service.createClassroom(ctx, await body());
      status = 201;
    } else if (resource === "classrooms" && action === "archive" && method === "POST")
      result = await service.archiveClassroom(ctx, entityId, await body());
    else if (
      resource === "classrooms" &&
      action === "roster" &&
      method === "GET"
    )
      result = await service.roster(ctx, entityId);
    else if (
      resource === "classrooms" &&
      action === "roster" &&
      subId === "import" &&
      method === "POST"
    )
      result = await service.importRoster(ctx, entityId, await request.text());
    else if (
      resource === "classrooms" &&
      action === "members" &&
      method === "POST"
    )
      result = await service.addMember(ctx, entityId, await body());
    else if (
      resource === "classrooms" &&
      action === "groups" &&
      method === "PATCH"
    )
      result = await service.updateArtifact(ctx, entityId, subId, await body());
    else if (resource === "assignments" && !entityId && method === "POST") {
      result = await service.createAssignment(ctx, await body());
      status = 201;
    } else if (resource === "assignments" && !action && method === "GET")
      result = await service.detail(ctx, entityId);
    else if (resource === "assignments" && !action && method === "PATCH")
      result = await service.editAssignment(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "instructor-pairs" &&
      method === "POST"
    )
      result = await service.assignInstructor(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "feasibility" &&
      method === "GET"
    )
      result = await service.feasibility(ctx, entityId);
    else if (
      resource === "assignments" &&
      action === "publish" &&
      method === "POST"
    )
      result = await service.publish(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "close" &&
      method === "POST"
    )
      result = await service.close(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "finalize" &&
      method === "POST"
    )
      result = await service.finalize(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "overrides" &&
      method === "POST"
    )
      result = await service.override(ctx, entityId, await body());
    else if (
      resource === "assignments" &&
      action === "my-evaluations" &&
      method === "GET"
    )
      result = await service.evaluations(
        ctx,
        entityId,
        url.searchParams.get("side"),
      );
    else if (
      resource === "assignments" &&
      action === "submissions" &&
      method === "POST"
    )
      result = await service.submit(
        ctx,
        entityId,
        await body(),
        request.headers.get("idempotency-key"),
      );
    else if (
      resource === "assignments" &&
      action === "my-score" &&
      method === "GET"
    )
      result = await service.myScore(ctx, entityId);
    else if (
      resource === "assignments" &&
      action === "reports" &&
      method === "GET"
    )
      result = await service.reports(ctx, entityId, subId);
    else if (
      resource === "assignments" &&
      action === "recompute" &&
      method === "POST"
    )
      result = await service.reports(ctx, entityId, "individual");
    else if (
      resource === "assignments" &&
      action === "audit" &&
      method === "GET"
    )
      result = await service.auditLog(ctx, entityId);
    else if (
      resource === "assignments" &&
      action === "exports" &&
      method === "POST"
    ) {
      const csv = await service.export(ctx, entityId, await body());
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="paireval_${entityId.replace(/[^a-zA-Z0-9-]/g, "")}_${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      });
    } else if (resource === "comparisons" && method === "PUT")
      result = await service.save(ctx, entityId, await body());
    else throw new AppError(404, "NOT_FOUND", "ไม่พบ API");
    return Response.json(result, {
      status,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    return Response.json(
      {
        error: {
          code:
            error instanceof AppError
              ? error.code
              : error instanceof ZodError
                ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR",
          message:
            error instanceof AppError
              ? error.message
              : error instanceof ZodError
                ? error.issues.map((i) => i.message).join("; ")
                : "ระบบขัดข้อง กรุณาลองใหม่",
          field: null,
          requestId,
        },
      },
      {
        status,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  } finally {
    console.info(
      JSON.stringify({
        event: "http_request",
        requestId,
        method,
        route: `${resource || "root"}/:id/${action || ""}`,
        statusCode: status,
        duration_ms: Math.round(performance.now() - start),
      }),
    );
  }
}
