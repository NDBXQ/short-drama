import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { publicResources, sharedResources, users } from "@/shared/schema"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { logger } from "@/shared/logger"
import { or, eq, sql } from "drizzle-orm"

export const runtime = "nodejs"

const adminAccount = (process.env.ADMIN_ACCOUNT ?? "admin").trim()
const adminPanelEnabled = process.env.ADMIN_PANEL_ENABLED === "1" || process.env.NODE_ENV !== "production"

const bodySchema = z
  .object({
    account: z.string().trim().min(1).max(100).optional(),
    userId: z.string().trim().min(1).optional(),
    mode: z.enum(["all", "nullOnly"]).optional(),
    seedToShared: z.boolean().optional(),
    seedSharedDemo: z.boolean().optional(),
    seedSharedDemoLimit: z.number().int().min(1).max(50).optional(),
    debug: z.boolean().optional()
  })
  .refine((v) => Boolean(v.account || v.userId), { message: "account 或 userId 至少提供一个" })
function deny(traceId: string, code: string, message: string, status: number): Response {
  return NextResponse.json(makeApiErr(traceId, code, message), { status })
}

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const start = Date.now()

  if (!adminPanelEnabled) return deny(traceId, "ADMIN_PANEL_DISABLED", "管理员后台未启用", 404)

  const session = await getSessionFromRequest(req)
  if (!session?.userId) return deny(traceId, "AUTH_REQUIRED", "未登录或登录已过期", 401)
  if (process.env.NODE_ENV === "production" && session.account !== adminAccount) {
    return deny(traceId, "ADMIN_REQUIRED", "需要管理员权限", 403)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return deny(traceId, "VALIDATION_FAILED", "参数不正确", 400)

  const account = (parsed.data.account ?? "").trim()
  const userId = parsed.data.userId
  const mode = parsed.data.mode ?? "all"
  const seedToShared = parsed.data.seedToShared ?? true
  const seedSharedDemo = parsed.data.seedSharedDemo ?? true
  const seedSharedDemoLimit = parsed.data.seedSharedDemoLimit ?? 12
  const debug = parsed.data.debug ?? false

  const db = await getDb({ users, publicResources, sharedResources })
  const rawAccount = account
  const accountEmailKey = rawAccount.startsWith("account:") ? rawAccount : `account:${rawAccount}`

  const targetUserRows = userId
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    : await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          or(
            eq(users.name, rawAccount),
            eq(users.email, rawAccount),
            eq(users.email, accountEmailKey),
            sql`lower(${users.name}) = lower(${rawAccount})`,
            sql`lower(${users.email}) = lower(${rawAccount})`,
            sql`lower(${users.email}) = lower(${accountEmailKey})`
          )
        )
        .limit(1)

  const targetUser = targetUserRows[0]
  if (!targetUser?.id) {
    if (debug) {
      const dbMeta = await db.execute(
        sql`select current_database() as database, current_schema() as schema, inet_server_addr() as server_addr, inet_server_port() as server_port`
      )
      const userCount = await db.execute(sql`select count(*)::int as count from ${users}`)
      const fuzzyMatches =
        rawAccount.length > 0
          ? await db.execute(sql`
              select id, name, email
              from ${users}
              where lower(${users.name}) like lower(${`%${rawAccount}%`})
                 or lower(${users.email}) like lower(${`%${rawAccount}%`})
              limit 5
            `)
          : null

      return NextResponse.json(
        makeApiOk(traceId, {
          found: false,
          input: { account: rawAccount, userId, accountEmailKey },
          dbMeta: (dbMeta as any)?.rows?.[0] ?? null,
          userCount: (userCount as any)?.rows?.[0]?.count ?? null,
          fuzzyMatches: (fuzzyMatches as any)?.rows ?? []
        }),
        { status: 200 }
      )
    }

    return deny(traceId, "NOT_FOUND", "目标账号未匹配到用户记录（可加 debug:true 查看当前连接数据库与候选用户）", 404)
  }

  logger.info({
    event: "library_force_migrate_start",
    module: "library",
    traceId,
    message: "开始强制迁移资源到指定账号",
    operator: session.account,
    targetAccount: userId ? undefined : rawAccount,
    targetUserIdInput: userId,
    targetUserId: targetUser.id,
    mode,
    seedToShared,
    seedSharedDemo,
    seedSharedDemoLimit
  })

  let movedSeedCount = 0
  if (seedToShared) {
    const movedSeed = await db.execute(sql`
      INSERT INTO ${sharedResources} (
        id,
        type,
        source,
        name,
        description,
        preview_url,
        preview_storage_key,
        original_url,
        original_storage_key,
        tags,
        applicable_scenes,
        created_at
      )
      SELECT
        pr.id,
        pr.type,
        'seed',
        pr.name,
        pr.description,
        pr.preview_url,
        pr.preview_storage_key,
        pr.original_url,
        pr.original_storage_key,
        pr.tags,
        pr.applicable_scenes,
        pr.created_at
      FROM ${publicResources} pr
      WHERE pr.source = 'seed'
      ON CONFLICT (id) DO NOTHING
    `)
    movedSeedCount = Number((movedSeed as any)?.rowCount ?? 0)

    await db.execute(sql`
      DELETE FROM ${publicResources} pr
      WHERE pr.source = 'seed'
    `)
  }

  const assigned = await db.execute(
    mode === "nullOnly"
      ? sql`UPDATE ${publicResources} pr SET user_id = ${targetUser.id} WHERE pr.user_id IS NULL`
      : sql`UPDATE ${publicResources} pr SET user_id = ${targetUser.id}`
  )
  const assignedCount = Number((assigned as any)?.rowCount ?? 0)

  let demoInsertedCount = 0
  if (seedSharedDemo) {
    const sharedAny = await db.execute(sql`SELECT 1 FROM ${sharedResources} sr LIMIT 1`)
    const sharedHasAny = Array.isArray((sharedAny as any)?.rows) ? (sharedAny as any).rows.length > 0 : Boolean((sharedAny as any)?.rowCount)
    if (!sharedHasAny) {
      const inserted = await db.execute(sql`
        INSERT INTO ${sharedResources} (
          id,
          type,
          source,
          name,
          description,
          preview_url,
          preview_storage_key,
          original_url,
          original_storage_key,
          tags,
          applicable_scenes,
          created_at
        )
        SELECT
          gen_random_uuid(),
          pr.type,
          'seed',
          pr.name,
          pr.description,
          pr.preview_url,
          pr.preview_storage_key,
          pr.original_url,
          pr.original_storage_key,
          pr.tags,
          pr.applicable_scenes,
          pr.created_at
        FROM ${publicResources} pr
        WHERE pr.user_id = ${targetUser.id}
        ORDER BY pr.created_at DESC
        LIMIT ${seedSharedDemoLimit}
      `)
      demoInsertedCount = Number((inserted as any)?.rowCount ?? 0)
    }
  }

  logger.info({
    event: "library_force_migrate_success",
    module: "library",
    traceId,
    message: "强制迁移资源到指定账号完成",
    operator: session.account,
    targetAccount: account,
    targetUserId: targetUser.id,
    movedSeedCount,
    assignedCount,
    demoInsertedCount,
    durationMs: Date.now() - start
  })

  return NextResponse.json(makeApiOk(traceId, { targetUserId: targetUser.id, movedSeedCount, assignedCount, demoInsertedCount }), {
    status: 200
  })
}
