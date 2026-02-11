import type { ReactElement } from "react"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { getDb } from "coze-coding-dev-sdk"
import { stories, storyOutlines } from "@/shared/schema"
import { ShortDramaSetupPage } from "@/features/script/shortDramaSetup/ShortDramaSetupPage"

export const dynamic = "force-dynamic"

export default async function Page({
  params,
  searchParams
}: {
  params: { storyId: string } | Promise<{ storyId: string }>
  searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>
}): Promise<ReactElement> {
  const resolvedParams = await Promise.resolve(params)
  const storyId = resolvedParams.storyId?.trim()
  if (!storyId) notFound()

  await Promise.resolve(searchParams)

  let row:
    | {
        metadata: unknown
        title: string | null
        aspectRatio: string | null
        resolution: string | null
        shotStyle: string | null
      }
    | undefined
  let hasOutlines = false

  try {
    const db = await getDb({ stories, storyOutlines })
    const rows = await db
      .select({
        metadata: stories.metadata,
        title: stories.title,
        aspectRatio: stories.aspectRatio,
        resolution: stories.resolution,
        shotStyle: stories.shotStyle
      })
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1)
    row = rows[0]
    if (!row) notFound()

    const outlineRows = await db.select({ id: storyOutlines.id }).from(storyOutlines).where(eq(storyOutlines.storyId, storyId)).limit(1)
    hasOutlines = outlineRows.length > 0
  } catch (e) {
    const anyErr = e as { message?: string }
    throw new Error(
      `数据库连接失败：${anyErr?.message ?? "unknown"}\n请检查 PGDATABASE_URL 是否可达（网络/防火墙/IP 白名单/内网限制），以及本地进程是否已重启加载最新 .env.local。`
    )
  }

  if (!row) notFound()
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  return (
    <ShortDramaSetupPage
      storyId={storyId}
      storyMetadata={metadata}
      hasOutlines={hasOutlines}
      storyConfig={{
        title: row.title ?? "",
        ratio: row.aspectRatio ?? "16:9",
        resolution: row.resolution ?? "1080p",
        style: row.shotStyle ?? "realistic"
      }}
    />
  )
}
