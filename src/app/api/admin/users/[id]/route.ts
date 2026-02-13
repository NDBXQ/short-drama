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

const patchBodySchema = z.object({
  email: z.string().trim().max(200).optional(),
  roleKey: z.string().trim().min(1).max(50).optional()
})

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "缺少用户 ID"), { status: 400 })

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })

  const rows = await db
    .select({
      id: users.id,
      account: users.name,
      email: users.email,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      roleKey: userSecurity.roleKey,
      tokenVersion: userSecurity.tokenVersion,
      lastLoginAt: userSecurity.lastLoginAt,
      passwordUpdatedAt: userSecurity.passwordUpdatedAt,
      failedLoginCount: userSecurity.failedLoginCount,
      lockedUntil: userSecurity.lockedUntil,
      disabledAt: userSecurity.disabledAt,
      disabledReason: userSecurity.disabledReason
    })
    .from(users)
    .leftJoin(userSecurity, eq(userSecurity.userId, users.id))
    .where(eq(users.id, id))
    .limit(1)

  const row = rows[0]
  if (!row?.id) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "账号不存在"), { status: 404 })

  return NextResponse.json(
    makeApiOk(traceId, {
      user: {
        id: row.id,
        account: row.account,
        email: row.email,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        security: {
          roleKey: row.roleKey ?? "user",
          tokenVersion: row.tokenVersion ?? 1,
          lastLoginAt: row.lastLoginAt ?? null,
          passwordUpdatedAt: row.passwordUpdatedAt ?? null,
          failedLoginCount: row.failedLoginCount ?? 0,
          lockedUntil: row.lockedUntil ?? null,
          disabledAt: row.disabledAt ?? null,
          disabledReason: row.disabledReason ?? null
        }
      }
    }),
    { status: 200 }
  )
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const { id } = await ctx.params
  if (!id?.trim()) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "缺少用户 ID"), { status: 400 })

  const parsed = patchBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })
  }

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })

  const existing = await db
    .select({
      id: users.id,
      account: users.name,
      email: users.email,
      roleKey: userSecurity.roleKey
    })
    .from(users)
    .leftJoin(userSecurity, eq(userSecurity.userId, users.id))
    .where(eq(users.id, id))
    .limit(1)

  const before = existing[0]
  if (!before?.id) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "账号不存在"), { status: 404 })

  const nextEmail = parsed.data.email !== undefined ? parsed.data.email.trim() : undefined
  const nextRoleKey = parsed.data.roleKey !== undefined ? parsed.data.roleKey.trim() : undefined

  if (nextEmail !== undefined) {
    await db.update(users).set({ email: nextEmail || null, updatedAt: new Date() }).where(eq(users.id, id))
  }

  if (nextRoleKey !== undefined) {
    await db
      .insert(userSecurity)
      .values({ userId: id, roleKey: nextRoleKey, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: { roleKey: nextRoleKey, updatedAt: new Date() }
      })
  }

  const after = {
    id,
    account: before.account,
    email: nextEmail !== undefined ? (nextEmail || null) : before.email,
    roleKey: nextRoleKey !== undefined ? nextRoleKey : (before.roleKey ?? "user")
  }

  await db.execute(sql`
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, target_user_id, before, after, ip, user_agent, trace_id)
    values (
      ${admin.userId},
      'user.update',
      'user',
      ${id},
      ${id},
      ${JSON.stringify({ id, account: before.account, email: before.email, roleKey: before.roleKey ?? "user" })}::jsonb,
      ${JSON.stringify(after)}::jsonb,
      ${admin.ip},
      ${admin.userAgent},
      ${traceId}
    )
  `)

  return NextResponse.json(makeApiOk(traceId, { user: after }), { status: 200 })
}

