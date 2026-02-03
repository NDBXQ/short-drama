import { NextResponse, type NextRequest } from "next/server"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { ensureSmoothLibraryMigration } from "@/shared/libraryMigration"

export const runtime = "nodejs"

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)

  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const r = await ensureSmoothLibraryMigration(userId, traceId)
  return NextResponse.json(makeApiOk(traceId, r), { status: 200 })
}
