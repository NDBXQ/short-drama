import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"

const inputSchema = z.object({
  uploadId: z.string().trim().min(1)
})

function getUploadRoot(): string {
  return path.join(process.cwd(), ".tmp", "public-resource-uploads")
}

async function readUserId(uploadId: string): Promise<string | null> {
  try {
    const dir = path.join(getUploadRoot(), uploadId)
    const text = await readFile(path.join(dir, "manifest.json"), "utf8")
    const obj = JSON.parse(text) as any
    return typeof obj?.userId === "string" ? obj.userId : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(makeApiErr(traceId, "INVALID_JSON", "请求体不是合法 JSON"), { status: 400 })
  }
  const parsed = inputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const uploadId = parsed.data.uploadId
  const ownerUserId = await readUserId(uploadId)
  if (ownerUserId && ownerUserId !== userId) return NextResponse.json(makeApiErr(traceId, "FORBIDDEN", "无权限操作该上传任务"), { status: 403 })

  const dir = path.join(getUploadRoot(), uploadId)
  await rm(dir, { recursive: true, force: true })
  return NextResponse.json(makeApiOk(traceId, { uploadId }), { status: 200 })
}

