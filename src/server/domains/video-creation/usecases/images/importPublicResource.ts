import { getDb } from "coze-coding-dev-sdk"
import { and, desc, eq, inArray } from "drizzle-orm"
import { generatedImages, publicResources, stories, storyOutlines, storyboards, type StoryboardScriptContent } from "@/shared/schema"
import { buildEmptyScript, withReferenceAsset } from "@/server/domains/video-creation/lib/storyboardScript"

export async function importVideoCreationPublicResource(input: {
  userId: string
  storyboardId: string
  publicResourceId: string
  name: string
  displayName?: string
  category: string
}): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; message: string; status: number }
> {
  const db = await getDb({ generatedImages, publicResources, stories, storyOutlines, storyboards })
  const slotName = input.name.trim()
  if (!slotName) return { ok: false, code: "VALIDATION_FAILED", message: "缺少素材名称", status: 400 }

  const storyRow = await db
    .select({ storyId: stories.id, scriptContent: storyboards.scriptContent })
    .from(storyboards)
    .innerJoin(storyOutlines, eq(storyboards.outlineId, storyOutlines.id))
    .innerJoin(stories, eq(storyOutlines.storyId, stories.id))
    .where(and(eq(storyboards.id, input.storyboardId), eq(stories.userId, input.userId)))
    .limit(1)

  const effectiveStoryId = storyRow[0]?.storyId ?? null
  if (!effectiveStoryId) return { ok: false, code: "STORY_NOT_FOUND", message: "未找到可用的故事", status: 404 }

  const pr = await db.select().from(publicResources).where(eq(publicResources.id, input.publicResourceId)).limit(1)
  const resource = pr[0] as any
  if (!resource) return { ok: false, code: "RESOURCE_NOT_FOUND", message: "未找到可用素材", status: 404 }

  const url = (resource.originalUrl || resource.previewUrl || "").trim()
  const storageKey = (resource.originalStorageKey || resource.previewStorageKey || "").trim()
  if (!url || !storageKey) return { ok: false, code: "RESOURCE_NOT_READY", message: "素材缺少可用存储信息", status: 400 }

  const thumbnailUrl = (resource.previewUrl || "").trim() || null
  const thumbnailStorageKey = (resource.previewStorageKey || "").trim() || null

  const assetName = (typeof resource.name === "string" ? resource.name : input.displayName ?? input.name).trim() || slotName
  const assetDescription = typeof resource.description === "string" ? resource.description : ""

  const candidateNames = Array.from(new Set([slotName, assetName])).filter(Boolean)
  const existed = await db
    .select({ id: generatedImages.id, createdAt: generatedImages.createdAt })
    .from(generatedImages)
    .where(
      and(
        eq(generatedImages.storyId, effectiveStoryId),
        eq(generatedImages.category, input.category),
        inArray(generatedImages.name, candidateNames)
      )
    )
    .orderBy(desc(generatedImages.createdAt))
    .limit(20)

  const keepId = existed[0]?.id ?? null
  const saved =
    keepId
      ? (
          await db
            .update(generatedImages)
            .set({
              name: slotName,
              url,
              storageKey,
              thumbnailUrl,
              thumbnailStorageKey,
              description: typeof resource.description === "string" ? resource.description : null,
              storyboardId: null
            })
            .where(eq(generatedImages.id, keepId))
            .returning()
        )[0]
      : (
          await db
            .insert(generatedImages)
            .values({
              storyId: effectiveStoryId,
              storyboardId: null,
              name: slotName,
              description: typeof resource.description === "string" ? resource.description : null,
              url,
              storageKey,
              thumbnailUrl,
              thumbnailStorageKey,
              category: input.category
            })
            .returning()
        )[0]

  const idsToDelete = existed.map((r) => r.id).filter((id) => id && id !== keepId)
  if (idsToDelete.length > 0) {
    await db.delete(generatedImages).where(inArray(generatedImages.id, idsToDelete))
  }

  const currentScript = (storyRow[0]?.scriptContent ?? buildEmptyScript()) as StoryboardScriptContent
  const nextScript = withReferenceAsset(currentScript, {
    category: input.category,
    entityName: slotName,
    assetName,
    assetDescription
  })
  await db.update(storyboards).set({ scriptContent: nextScript, updatedAt: new Date() }).where(eq(storyboards.id, input.storyboardId))

  return {
    ok: true,
    data: { ...(saved as any), pickedEntityName: slotName, pickedTitle: assetName, pickedDescription: assetDescription }
  }
}
