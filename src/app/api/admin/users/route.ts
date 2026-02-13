import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq, or, sql } from "drizzle-orm"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getTraceId } from "@/shared/trace"
import { getDb } from "@/server/db/getDb"
import { ensurePublicSchema } from "@/server/db/ensurePublicSchema"
import { userSecurity, users } from "@/shared/schema"
import { requireAdmin } from "@/server/domains/admin/services/adminGuard"
import { hashPassword } from "@/features/auth/password"

export const runtime = "nodejs"

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  role: z.string().trim().min(1).max(50).optional(),
  sort: z.enum(["createdAt", "lastLoginAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.string().trim().optional(),
  offset: z.string().trim().optional()
})

const createBodySchema = z.object({
  account: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200),
  roleKey: z.string().trim().min(1).max(50).optional()
})

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })
  }

  const limit = Math.max(1, Math.min(100, Number(parsed.data.limit ?? "20") || 20))
  const offset = Math.max(0, Number(parsed.data.offset ?? "0") || 0)
  const q = (parsed.data.q ?? "").trim().toLowerCase()
  const sort = parsed.data.sort ?? "createdAt"
  const order = parsed.data.order ?? "desc"

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })

  const whereParts: any[] = []
  if (parsed.data.status === "active") whereParts.push(eq(users.isActive, true))
  if (parsed.data.status === "inactive") whereParts.push(eq(users.isActive, false))
  if (parsed.data.role) whereParts.push(eq(userSecurity.roleKey, parsed.data.role))

  if (q) {
    const like = `%${q}%`
    whereParts.push(
      or(
        sql`lower(${users.name}) like ${like}`,
        sql`lower(coalesce(${users.email}, '')) like ${like}`,
        sql`${users.id} = ${q}`
      )
    )
  }

  const where = whereParts.length > 0 ? and(...whereParts) : undefined

  const orderExpr =
    sort === "lastLoginAt"
      ? sql`coalesce(${userSecurity.lastLoginAt}, '1970-01-01'::timestamptz)`
      : users.createdAt

  const rows = await db
    .select({
      id: users.id,
      account: users.name,
      email: users.email,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      roleKey: userSecurity.roleKey,
      lastLoginAt: userSecurity.lastLoginAt
    })
    .from(users)
    .leftJoin(userSecurity, eq(userSecurity.userId, users.id))
    .where(where)
    .orderBy(order === "asc" ? asc(orderExpr) : desc(orderExpr))
    .limit(limit)
    .offset(offset)

  const items = rows.map((r) => ({
    id: r.id,
    account: r.account,
    email: r.email,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    roleKey: r.roleKey ?? "user",
    lastLoginAt: r.lastLoginAt ?? null
  }))

  return NextResponse.json(makeApiOk(traceId, { items, limit, offset }), { status: 200 })
}

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const parsed = createBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "请求参数不正确"), { status: 400 })
  }

  const account = parsed.data.account.trim()
  const email = (parsed.data.email ?? "").trim()
  const roleKey = (parsed.data.roleKey ?? "user").trim()

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.name, account))
    .limit(1)
  if (existing[0]?.id) {
    return NextResponse.json(makeApiErr(traceId, "ALREADY_EXISTS", "账号已存在"), { status: 409 })
  }

  const passwordHash = await hashPassword(parsed.data.password)
  const [created] = await db
    .insert(users)
    .values({
      name: account,
      email: email ? email : null,
      password: passwordHash,
      isActive: true,
      updatedAt: new Date()
    })
    .returning()

  if (!created?.id) {
    return NextResponse.json(makeApiErr(traceId, "CREATE_FAILED", "创建账号失败"), { status: 500 })
  }

  await db
    .insert(userSecurity)
    .values({
      userId: created.id,
      roleKey,
      tokenVersion: 1,
      passwordUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    })
    .onConflictDoNothing()

  await db.execute(sql`
    insert into public.audit_logs (actor_user_id, action, target_type, target_id, target_user_id, before, after, ip, user_agent, trace_id)
    values (
      ${admin.userId},
      'user.create',
      'user',
      ${created.id},
      ${created.id},
      '{}'::jsonb,
      ${JSON.stringify({ id: created.id, account, email: created.email, roleKey, isActive: true })}::jsonb,
      ${admin.ip},
      ${admin.userAgent},
      ${traceId}
    )
  `)

  return NextResponse.json(
    makeApiOk(traceId, {
      user: {
        id: created.id,
        account: created.name,
        email: created.email,
        isActive: created.isActive,
        createdAt: created.createdAt
      }
    }),
    { status: 201 }
  )
}
