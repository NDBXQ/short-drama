import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { publicResources, insertPublicResourceSchema } from "@/shared/schema"
import { uploadPublicFile } from "@/shared/storage"
import { eq } from "drizzle-orm"

const inputSchema = z.object({
  type: z.string().trim().min(1).max(50),
  name: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: z.string().trim().max(5000).optional(),
  applicableScenes: z.string().trim().max(5000).optional()
})

export async function POST(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const session = await getSessionFromRequest(req)
  const userId = session?.userId
  if (!userId) return NextResponse.json(makeApiErr(traceId, "AUTH_REQUIRED", "未登录或登录已过期"), { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(makeApiErr(traceId, "INVALID_FORM", "请求体不是合法表单"), { status: 400 })
  }

  const file = form.get("file")
  const rawType = form.get("type")
  const rawName = form.get("name")
  const rawDesc = form.get("description")
  const rawTags = form.get("tags")
  const rawScenes = form.get("applicableScenes")

  if (!(file instanceof File)) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "缺少文件"), { status: 400 })

  const parsed = inputSchema.safeParse({
    type: typeof rawType === "string" ? rawType : "",
    name: typeof rawName === "string" ? rawName : undefined,
    description: typeof rawDesc === "string" ? rawDesc : undefined,
    tags: typeof rawTags === "string" ? rawTags : undefined,
    applicableScenes: typeof rawScenes === "string" ? rawScenes : undefined
  })
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const type = parsed.data.type
  const { url, key } = await uploadPublicFile(file, `public/${type}`)
  const nameFromFile = file.name.replace(/\.[^/.]+$/, "")
  const resourceName = parsed.data.name?.trim() || nameFromFile || "audio"
  const tags = (parsed.data.tags ?? "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100)
  const applicableScenes = (parsed.data.applicableScenes ?? "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100)

  const payload = insertPublicResourceSchema.parse({
    type,
    source: "upload",
    name: resourceName,
    description: parsed.data.description ?? "",
    previewUrl: url,
    previewStorageKey: key,
    originalUrl: url,
    originalStorageKey: key,
    tags,
    applicableScenes
  })

  const db = await getDb({ publicResources })
  const [row] = await db.insert(publicResources).values(payload).returning({ id: publicResources.id })
  const id = row?.id ?? null
  if (id) {
    const stablePreview = `/api/library/public-resources/file/${id}?kind=preview`
    const stableOriginal = `/api/library/public-resources/file/${id}?kind=original`
    await db
      .update(publicResources)
      .set({
        previewUrl: stablePreview,
        originalUrl: stableOriginal
      })
      .where(eq(publicResources.id, id))
  }

  return NextResponse.json(makeApiOk(traceId, { id, url: id ? `/api/library/public-resources/file/${id}?kind=original` : url, storageKey: key }), { status: 200 })
}
