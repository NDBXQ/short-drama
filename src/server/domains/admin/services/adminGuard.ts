import "server-only"

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { makeApiErr } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { ensurePublicSchema } from "@/server/db/ensurePublicSchema"
import { getDb } from "@/server/db/getDb"
import { userSecurity, users } from "@/shared/schema"
import { eq } from "drizzle-orm"

const adminAccount = (process.env.ADMIN_ACCOUNT ?? "admin").trim()
const adminPanelEnabled = process.env.ADMIN_PANEL_ENABLED === "1" || process.env.NODE_ENV !== "production"

function parseIpList(value: string | undefined): string[] {
  const raw = (value ?? "").trim()
  if (!raw) return []
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.includes("*")) return ["*"]
  return items
}

function getRequestIp(req: NextRequest): string {
  const xff = (req.headers.get("x-forwarded-for") ?? "").trim()
  if (xff) return xff.split(",")[0]!.trim()
  const xri = (req.headers.get("x-real-ip") ?? "").trim()
  if (xri) return xri
  return (req as any).ip ?? ""
}

function allowAdminIp(req: NextRequest): boolean {
  const allowlist = parseIpList(process.env.ADMIN_IP_ALLOWLIST)
  if (allowlist.length === 0) return true
  if (allowlist[0] === "*") return true
  const ip = getRequestIp(req)
  if (!ip) return false
  return allowlist.includes(ip)
}

export async function requireAdmin(req: NextRequest, traceId: string): Promise<{ userId: string; account: string; ip: string; userAgent: string } | Response> {
  if (!adminPanelEnabled) {
    return NextResponse.json(makeApiErr(traceId, "ADMIN_PANEL_DISABLED", "管理员后台未启用"), { status: 404 })
  }

  const session = await getSessionFromRequest(req)
  if (!session?.userId) {
    return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })
  }

  if (session.account !== adminAccount) {
    return NextResponse.json(makeApiErr(traceId, "ADMIN_REQUIRED", "需要管理员权限"), { status: 403 })
  }

  if (!allowAdminIp(req)) {
    return NextResponse.json(makeApiErr(traceId, "ADMIN_IP_DENIED", "当前 IP 不允许访问管理员接口"), { status: 403 })
  }

  await ensurePublicSchema()
  const db = await getDb({ users, userSecurity })
  const rows = await db
    .select({ userId: users.id, isActive: users.isActive, tokenVersion: userSecurity.tokenVersion })
    .from(users)
    .leftJoin(userSecurity, eq(userSecurity.userId, users.id))
    .where(eq(users.id, session.userId))
    .limit(1)
  const row = rows[0]
  if (!row?.userId) {
    return NextResponse.json(makeApiErr(traceId, "AUTH_USER_NOT_FOUND", "用户不存在"), { status: 401 })
  }
  if (!row.isActive) {
    return NextResponse.json(makeApiErr(traceId, "AUTH_DISABLED", "账号已禁用"), { status: 401 })
  }
  const tokenTv = session.tokenVersion ?? 1
  const dbTv = row.tokenVersion ?? 1
  if (tokenTv !== dbTv) {
    return NextResponse.json(makeApiErr(traceId, "AUTH_INVALID_SESSION", "登录已失效，请重新登录"), { status: 401 })
  }

  return {
    userId: session.userId,
    account: session.account,
    ip: getRequestIp(req),
    userAgent: req.headers.get("user-agent") ?? ""
  }
}
