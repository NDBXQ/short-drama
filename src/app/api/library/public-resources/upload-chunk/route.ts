import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"

const querySchema = z.object({
  uploadId: z.string().trim().min(1),
  index: z.coerce.number().int().min(0)
})

function getUploadRoot(): string {
  return path.join(process.cwd(), ".tmp", "public-resource-uploads")
}

type Manifest = {
  uploadId: string
  userId: string
  chunkSize: number
  totalChunks: number
}

async function readManifest(uploadId: string): Promise<Manifest | null> {
  try {
    const dir = path.join(getUploadRoot(), uploadId)
    const text = await readFile(path.join(dir, "manifest.json"), "utf8")
    return JSON.parse(text) as Manifest
  } catch {
    return null
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  const parsedQuery = querySchema.safeParse({
    uploadId: req.nextUrl.searchParams.get("uploadId"),
    index: req.nextUrl.searchParams.get("index")
  })
  if (!parsedQuery.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const { uploadId, index } = parsedQuery.data
  const manifest = await readManifest(uploadId)
  if (!manifest) return NextResponse.json(makeApiErr(traceId, "NOT_FOUND", "上传任务不存在"), { status: 404 })
  if (manifest.userId !== userId) return NextResponse.json(makeApiErr(traceId, "FORBIDDEN", "无权限操作该上传任务"), { status: 403 })
  if (index >= manifest.totalChunks) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "分片序号超出范围"), { status: 400 })

  const contentLengthHeader = req.headers.get("content-length") || ""
  const contentLength = Number.parseInt(contentLengthHeader, 10)
  if (Number.isFinite(contentLength) && contentLength > manifest.chunkSize + 1024 * 1024) {
    return NextResponse.json(makeApiErr(traceId, "CHUNK_TOO_LARGE", "分片过大"), { status: 400 })
  }

  let buf: Buffer
  try {
    buf = Buffer.from(await req.arrayBuffer())
  } catch {
    return NextResponse.json(makeApiErr(traceId, "INVALID_BODY", "读取分片失败"), { status: 400 })
  }

  const dir = path.join(getUploadRoot(), uploadId)
  await writeFile(path.join(dir, `chunk_${index}.part`), buf)

  return NextResponse.json(makeApiOk(traceId, { uploadId, index, size: buf.length }), { status: 200 })
}

