import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getTraceId } from "@/shared/trace"
import { getDb } from "@/server/db/getDb"
import { ensurePublicSchema } from "@/server/db/ensurePublicSchema"
import { userSecurity, users } from "@/shared/schema"
import { requireAdmin } from "@/server/domains/admin/services/adminGuard"

export const runtime = "nodejs"

const bodySchema = z.object({
  confirmAccount: z.string().trim().min(1).max(100)
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const { id } = await ctx.params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })

  const rows = await db
    .select({
      id: users.id,
      account: users.name,
      email: users.email,
      isActive: users.isActive
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  const user = rows[0]
  if (!user?.id) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "账号不存在"), { status: 404 })

  if (parsed.data.confirmAccount !== user.account) {
    return NextResponse.json(makeApiErr(traceId, "CONFIRM_MISMATCH", "确认账号不匹配"), { status: 400 })
  }

  await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, id))

  const now = new Date()
  await db
    .insert(userSecurity)
    .values({ userId: id, tokenVersion: 2, disabledAt: null, disabledReason: null, updatedAt: now })
    .onConflictDoUpdate({
      target: userSecurity.userId,
      set: {
        tokenVersion: sql`${userSecurity.tokenVersion} + 1`,
        disabledAt: null,
        disabledReason: null,
        updatedAt: now
      }
    })

  await db.execute(sql`
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, target_user_id, before, after, ip, user_agent, trace_id)
    values (
      ${admin.userId},
      'user.enable',
      'user',
      ${id},
      ${id},
      ${JSON.stringify({ id, account: user.account, email: user.email, isActive: user.isActive })}::jsonb,
      ${JSON.stringify({ id, account: user.account, email: user.email, isActive: true })}::jsonb,
      ${admin.ip},
      ${admin.userAgent},
      ${traceId}
    )
  `)

  return NextResponse.json(makeApiOk(traceId, { ok: true }), { status: 200 })
}

