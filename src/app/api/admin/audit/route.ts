import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq, gte, lte } from "drizzle-orm"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getTraceId } from "@/shared/trace"
import { getDb } from "@/server/db/getDb"
import { ensurePublicSchema } from "@/server/db/ensurePublicSchema"
import { auditLogs } from "@/shared/schema"
import { requireAdmin } from "@/server/domains/admin/services/adminGuard"

export const runtime = "nodejs"

const querySchema = z.object({
  actorUserId: z.string().trim().optional(),
  targetId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.string().trim().optional(),
  offset: z.string().trim().optional()
})

function toDateOrNull(input: string | undefined): Date | null {
  const raw = (input ?? "").trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d : null
}

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const url = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })

  const limit = Math.max(1, Math.min(200, Number(parsed.data.limit ?? "50") || 50))
  const offset = Math.max(0, Number(parsed.data.offset ?? "0") || 0)

  const from = toDateOrNull(parsed.data.from)
  const to = toDateOrNull(parsed.data.to)

  await ensurePublicSchema()
  const db = await getDb({ auditLogs })

  const whereParts: any[] = []
  if (parsed.data.actorUserId) whereParts.push(eq(auditLogs.actorUserId, parsed.data.actorUserId))
  if (parsed.data.targetId) whereParts.push(eq(auditLogs.targetId, parsed.data.targetId))
  if (parsed.data.action) whereParts.push(eq(auditLogs.action, parsed.data.action))
  if (from) whereParts.push(gte(auditLogs.createdAt, from))
  if (to) whereParts.push(lte(auditLogs.createdAt, to))

  const where = whereParts.length > 0 ? and(...whereParts) : undefined

  const rows = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      targetUserId: auditLogs.targetUserId,
      before: auditLogs.before,
      after: auditLogs.after,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      traceId: auditLogs.traceId
    })
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(makeApiOk(traceId, { items: rows, limit, offset }), { status: 200 })
}

