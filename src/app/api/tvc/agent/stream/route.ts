import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { makeApiErr } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { ServiceError } from "@/server/services/errors"
import { CozeTvcAgentService } from "@/server/services/cozeTvcAgentService"
import { VibeCreatingAgentService } from "@/server/services/vibeCreating/vibeCreatingAgentService"
import { readEnv } from "@/features/coze/env"

export const runtime = "nodejs"

const inputSchema = z.object({
  prompt: z.string().trim().min(1).max(50_000),
  sessionId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200).optional()
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })
  }

  try {
    const provider = (readEnv("TVC_AGENT_PROVIDER") ?? "vibe").trim().toLowerCase()
    const stream =
      provider === "coze"
        ? await CozeTvcAgentService.createStream({
            traceId,
            userId,
            prompt: parsed.data.prompt,
            sessionId: parsed.data.sessionId
          })
        : await VibeCreatingAgentService.createStream({
            traceId,
            userId,
            prompt: parsed.data.prompt,
            sessionId: parsed.data.sessionId,
            projectId: parsed.data.projectId ?? null
          })

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    })
  } catch (err) {
    if (err instanceof ServiceError) {
      let status = 500
      if (err.code === "COZE_NOT_CONFIGURED") status = 500
      return NextResponse.json(makeApiErr(traceId, err.code, err.message), { status })
    }
    const anyErr = err as { message?: string }
    return NextResponse.json(makeApiErr(traceId, "INTERNAL_ERROR", anyErr.message ?? "内部错误"), { status: 500 })
  }
}
