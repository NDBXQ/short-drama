import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { makeApiErr, makeApiOk } from "@/shared/api"
import { getSessionFromRequest } from "@/shared/session"
import { getTraceId } from "@/shared/trace"
import { generatedImages, stories, storyOutlines, storyboards, type StoryboardScriptContent } from "@/shared/schema"

const bodySchema = z.object({
  storyboardId: z.string().trim().min(1).max(200),
  sourceGeneratedImageId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(50).default("reference")
})

function buildEmptyScript(): StoryboardScriptContent {
  return {
    shot_info: { cut_to: false, shot_style: "", shot_duration: 0 },
    shot_content: {
      bgm: "",
      roles: [],
      shoot: { angle: "", shot_angle: "", camera_movement: "" },
      background: { status: "", background_name: "" },
      role_items: [],
      other_items: []
    },
    video_content: {
      items: [],
      roles: [],
      background: { description: "", background_name: "" },
      other_items: []
    }
  }
}

function withReferenceAsset(
  current: StoryboardScriptContent | null,
  input: { category: string; entityName: string; assetName: string; assetDescription: string }
): StoryboardScriptContent {
  const next = current ? structuredClone(current) : buildEmptyScript()
  const entityName = input.entityName.trim()
  const assetName = input.assetName.trim()
  const assetDescription = input.assetDescription.trim()
  if (!entityName || !assetName) return next

  if (input.category === "role") {
    const roles = Array.isArray(next.video_content.roles) ? next.video_content.roles : []
    let row = roles.find((r) => (r.role_name ?? "").trim() === entityName)
    if (!row) {
      row = { role_name: entityName, description: "" }
      roles.push(row)
      next.video_content.roles = roles
    }
    row.reference_image_name = assetName
    row.reference_image_description = assetDescription
    return next
  }

  if (input.category === "background") {
    const bg = next.video_content.background ?? { description: "", background_name: "" }
    bg.reference_image_name = assetName
    bg.reference_image_description = assetDescription
    next.video_content.background = bg
    return next
  }

  const items = Array.isArray(next.video_content.items) ? next.video_content.items : []
  const otherItems = Array.isArray(next.video_content.other_items) ? next.video_content.other_items : []
  let row =
    items.find((r) => (r.item_name ?? "").trim() === entityName) ??
    otherItems.find((r) => (r.item_name ?? "").trim() === entityName) ??
    null
  if (!row) {
    row = { relation: "", item_name: entityName, description: "" }
    items.push(row)
    next.video_content.items = items
  }
  row.reference_image_name = assetName
  row.reference_image_description = assetDescription
  return next
}

function renameEntityInScript(current: StoryboardScriptContent, input: { category: string; from: string; to: string }): StoryboardScriptContent {
  const from = input.from.trim()
  const to = input.to.trim()
  if (!from || !to || from === to) return current
  const next = structuredClone(current)
  if (input.category === "role") {
    for (const list of [next.shot_content?.roles, next.video_content?.roles]) {
      if (!Array.isArray(list)) continue
      for (const r of list) {
        if (r && typeof r.role_name === "string" && r.role_name.trim() === from) r.role_name = to
      }
    }
    return next
  }
  if (input.category === "background") {
    const bg1 = next.shot_content?.background
    if (bg1 && typeof bg1.background_name === "string" && bg1.background_name.trim() === from) bg1.background_name = to
    const bg2 = next.video_content?.background
    if (bg2 && typeof bg2.background_name === "string" && bg2.background_name.trim() === from) bg2.background_name = to
    return next
  }
  const replaceInArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return arr
    return arr.map((v) => (typeof v === "string" && v.trim() === from ? to : v))
  }
  next.shot_content.role_items = replaceInArray(next.shot_content.role_items) as any
  next.shot_content.other_items = replaceInArray(next.shot_content.other_items) as any
  for (const list of [next.video_content?.items, next.video_content?.other_items]) {
    if (!Array.isArray(list)) continue
    for (const it of list) {
      if (it && typeof it.item_name === "string" && it.item_name.trim() === from) it.item_name = to
    }
  }
  return next
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

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(makeApiErr(traceId, "VALIDATION_FAILED", "参数格式不正确"), { status: 400 })

  const { storyboardId, sourceGeneratedImageId, name, displayName, category } = parsed.data

  const db = await getDb({ generatedImages, stories, storyOutlines, storyboards })

  const storyRow = await db
    .select({ storyId: stories.id, scriptContent: storyboards.scriptContent })
    .from(storyboards)
    .innerJoin(storyOutlines, eq(storyboards.outlineId, storyOutlines.id))
    .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
    .where(and(eq(storyboards.id, storyboardId), eq(stories.userId, userId)))
    .limit(1)

  const effectiveStoryId = storyRow[0]?.storyId ?? null
  if (!effectiveStoryId) return NextResponse.json(makeApiErr(traceId, "STORY_NOT_FOUND", "未找到可用的故事"), { status: 404 })

  const srcRows = await db
    .select({
      id: generatedImages.id,
      storyId: generatedImages.storyId,
      name: generatedImages.name,
      description: generatedImages.description,
      url: generatedImages.url,
      storageKey: generatedImages.storageKey,
      thumbnailUrl: generatedImages.thumbnailUrl,
      thumbnailStorageKey: generatedImages.thumbnailStorageKey,
      prompt: generatedImages.prompt
    })
    .from(generatedImages)
    .innerJoin(stories, eq(generatedImages.storyId, stories.id))
    .where(and(eq(generatedImages.id, sourceGeneratedImageId), eq(stories.userId, userId)))
    .limit(1)

  const src = srcRows[0]
  if (!src || src.storyId !== effectiveStoryId) {
    return NextResponse.json(makeApiErr(traceId, "RESOURCE_NOT_FOUND", "未找到可用脚本素材"), { status: 404 })
  }

  const url = (src.url ?? "").trim()
  const storageKey = (src.storageKey ?? "").trim()
  if (!url || !storageKey) return NextResponse.json(makeApiErr(traceId, "RESOURCE_NOT_READY", "脚本素材缺少可用存储信息"), { status: 400 })

  const thumbnailUrl = (src.thumbnailUrl ?? "").trim() || null
  const thumbnailStorageKey = (src.thumbnailStorageKey ?? "").trim() || null

  const assetName = typeof src.name === "string" ? src.name : displayName ?? name
  const assetDescription = typeof src.description === "string" ? src.description : ""

  const existed = await db
    .select({ id: generatedImages.id })
    .from(generatedImages)
    .where(and(eq(generatedImages.storyId, effectiveStoryId), eq(generatedImages.storyboardId, storyboardId), eq(generatedImages.name, name), eq(generatedImages.category, category)))
    .orderBy(desc(generatedImages.createdAt))
    .limit(1)

  const existing = existed[0]
  const saved =
    existing
      ? (
          await db
            .update(generatedImages)
            .set({
              name: assetName,
              url,
              storageKey,
              thumbnailUrl,
              thumbnailStorageKey,
              description: typeof src.description === "string" ? src.description : null,
              prompt: typeof src.prompt === "string" ? src.prompt : null
            })
            .where(eq(generatedImages.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(generatedImages)
            .values({
              storyId: effectiveStoryId,
              storyboardId,
              name: assetName,
              description: typeof src.description === "string" ? src.description : null,
              url,
              storageKey,
              thumbnailUrl,
              thumbnailStorageKey,
              category,
              prompt: typeof src.prompt === "string" ? src.prompt : null
            })
            .returning()
        )[0]

  const renamedScript = renameEntityInScript(storyRow[0]?.scriptContent ?? buildEmptyScript(), { category, from: name, to: assetName })
  const nextScript = withReferenceAsset(renamedScript, {
    category,
    entityName: assetName,
    assetName,
    assetDescription
  })
  await db.update(storyboards).set({ scriptContent: nextScript, updatedAt: new Date() }).where(eq(storyboards.id, storyboardId))

  return NextResponse.json(
    makeApiOk(traceId, { ...saved, pickedEntityName: assetName, pickedTitle: assetName, pickedDescription: assetDescription }),
    { status: 200 }
  )
}
