"use client"

import type { ReactElement } from "react"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ScopeTabs } from "./components/ScopeTabs"
import { MyTypeTabs, type MyContentType } from "./components/MyTypeTabs"
import { CategorySidebar } from "./components/CategorySidebar"
import { LibraryToolbar } from "./components/LibraryToolbar"
import { LibraryGrid } from "./components/LibraryGrid"
import { MyStoriesGroupedGrid } from "./components/MyStoriesGroupedGrid"
import { UploadResourceModal } from "./components/UploadResourceModal"
import { AiGenerateResourceModal } from "./components/AiGenerateResourceModal"
import { BulkActionBar } from "./components/BulkActionBar"
import { PublicResourcePreviewModal } from "./components/PublicResourcePreviewModal"
import { StoryContentModal } from "./components/StoryContentModal"
import { ConfirmModal } from "./components/ConfirmModal"
import { deleteStory } from "./actions/library"
import { aiGeneratePublicResource } from "./actions/ai-generate"
import type { LibraryItem } from "./components/LibraryCard"
import styles from "./ContentLibraryPage.module.css"
import { useLibraryData } from "./hooks/useLibraryData"
import { useLibrarySelection } from "./hooks/useLibrarySelection"
import { mapAiTypeToDbType } from "./utils/libraryUtils"
import { postFormDataWithProgress, putBlobWithProgress } from "@/shared/utils/uploadWithProgress"

export function ContentLibraryPage(): ReactElement {
  const router = useRouter()
  
  const {
    scope, setScope,
    category, setCategory,
    view, setView,
    query, setQuery,
    updateUrl,
    displayItems,
    publicTotal,
    publicHasMore,
    publicLoadingMore,
    loadMorePublic,
    counts,
    categories,
    loading,
    refreshPublicData,
    loadMyStories
  } = useLibraryData()

  const {
    selectedIds,
    setSelectedIds,
    toggleSelected,
    clearSelected,
    previewItem,
    setPreviewItem,
    bulkDeleting,
    handleBulkDelete
  } = useLibrarySelection(scope, category)

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [myType, setMyType] = useState<MyContentType>("standard")
  const [storyDeleteConfirm, setStoryDeleteConfirm] = useState<{ ids: string[] } | null>(null)
  const [storyDeleting, setStoryDeleting] = useState(false)
  const [publicDeleteConfirm, setPublicDeleteConfirm] = useState<{ ids: string[] } | null>(null)
  const [storyContentItem, setStoryContentItem] = useState<{ id: string; title?: string } | null>(null)
  const [notice, setNotice] = useState<{ type: "info" | "error"; message: string } | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (scope !== "my") setMyType("standard")
  }, [scope])

  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (scope !== "my") return
      if (item.type === "tvc") {
        router.push(`/tvc?projectId=${encodeURIComponent(item.id)}`)
        return
      }
      const stage = item.progressStage ?? "outline"
      if (stage === "outline") {
        router.push(`/script/workspace/${item.id}`)
        return
      }
      router.push(`/video?storyId=${item.id}&tab=list`)
    },
    [router, scope]
  )

  const myFilteredItems =
    scope !== "my"
      ? displayItems
      : myType === "tvc"
        ? displayItems.filter((i) => i.type === "tvc")
        : displayItems.filter((i) => i.type !== "tvc")

  const openMyStoriesDeleteConfirm = useCallback(() => {
    if (selectedIds.size <= 0) return
    setStoryDeleteConfirm({ ids: Array.from(selectedIds) })
  }, [selectedIds])

  const confirmMyStoriesDelete = useCallback(async () => {
    const ids = storyDeleteConfirm?.ids ?? []
    if (ids.length <= 0 || storyDeleting) return
    setStoryDeleting(true)
    try {
      const failedIds: string[] = []
      const concurrency = Math.max(1, Math.min(6, ids.length))
      let cursor = 0
      await Promise.all(
        Array.from({ length: concurrency }).map(async () => {
          while (true) {
            const i = cursor
            cursor += 1
            if (i >= ids.length) return
            const id = ids[i]!
            try {
              await deleteStory(id)
            } catch {
              failedIds.push(id)
            }
          }
        })
      )
      await loadMyStories(query)
      setSelectedIds(new Set(failedIds))
      setStoryDeleteConfirm(null)
      const okCount = ids.length - failedIds.length
      if (failedIds.length > 0) {
        setNotice({ type: "error", message: `删除完成：成功 ${okCount}/${ids.length}，失败 ${failedIds.length}` })
      } else {
        setNotice({ type: "info", message: `已删除 ${okCount} 个剧本` })
      }
    } finally {
      setStoryDeleting(false)
    }
  }, [loadMyStories, query, setSelectedIds, storyDeleteConfirm, storyDeleting])

  const openPublicBulkDeleteConfirm = useCallback(() => {
    if (scope !== "library") return
    if (selectedIds.size <= 0) return
    setPublicDeleteConfirm({ ids: Array.from(selectedIds) })
  }, [scope, selectedIds])

  const confirmPublicBulkDelete = useCallback(async () => {
    const ids = publicDeleteConfirm?.ids ?? []
    if (ids.length <= 0) return
    const deletedCount = await handleBulkDelete(ids, refreshPublicData)
    setPublicDeleteConfirm(null)
    setNotice({ type: "info", message: `已删除 ${deletedCount ?? 0} 项素材` })
  }, [handleBulkDelete, publicDeleteConfirm, refreshPublicData])

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.contentWrap}>
            {notice ? (
              <div className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : styles.noticeInfo}`} role="status">
                {notice.message}
              </div>
            ) : null}
            <div className={styles.topRow}>
              <div className={styles.scopeWrap}>
                <ScopeTabs
                  value={scope}
                  onChange={(next) => {
                    setScope(next)
                    const nextCategory = next === "my" ? "draft" : "all"
                    setCategory(nextCategory)
                    updateUrl({ scope: next, category: nextCategory })
                  }}
                />
              </div>
              {scope === "my" ? <MyTypeTabs value={myType} onChange={setMyType} /> : null}

              <LibraryToolbar
                view={view}
                onViewChange={(next) => {
                  setView(next)
                  updateUrl({ view: next })
                }}
                onSearch={(next) => {
                  setQuery(next)
                  updateUrl({ q: next || null })
                }}
                variant={scope}
                onUpload={() => setUploadModalOpen(true)}
                onGenerate={() => setAiModalOpen(true)}
                deleteLabel={
                  scope === "my"
                    ? selectedIds.size > 0
                      ? `删除剧本（${selectedIds.size}）`
                      : "删除剧本"
                    : scope === "library"
                      ? selectedIds.size > 0
                        ? `删除素材（${selectedIds.size}）`
                        : "删除素材"
                      : undefined
                }
                deleteDisabled={
                  scope === "my"
                    ? selectedIds.size <= 0 || storyDeleting
                    : scope === "library"
                      ? selectedIds.size <= 0 || bulkDeleting
                      : undefined
                }
                onDelete={scope === "my" ? openMyStoriesDeleteConfirm : scope === "library" ? openPublicBulkDeleteConfirm : undefined}
              />
            </div>

            <div className={styles.bodyRow}>
              {scope === "library" || scope === "shared" ? (
                <CategorySidebar
                  value={category}
                  onChange={(next) => {
                    setCategory(next)
                    updateUrl({ category: next })
                  }}
                  categories={categories}
                  counts={counts}
                />
              ) : null}

              <div className={styles.contentInner}>
                <div className={styles.gridWrap}>
                  {scope === "my" ? (
                    <MyStoriesGroupedGrid
                      items={myFilteredItems}
                      view={view}
                      onItemClick={(item) => handleItemClick(item)}
                      onViewContent={(item) => setStoryContentItem({ id: item.id, title: item.title })}
                      selectedIds={selectedIds}
                      onToggleSelected={toggleSelected}
                      onCreateTvc={() => router.push("/tvc")}
                      showStandard={myType === "standard"}
                      showTvc={myType === "tvc"}
                    />
                  ) : (
                    <LibraryGrid
                      items={displayItems}
                      view={view}
                      onItemClick={(item) => setPreviewItem(item)}
                      selectedIds={selectedIds}
                      onToggleSelected={toggleSelected}
                    />
                  )}
                </div>
                {scope === "library" || scope === "shared" ? (
                  <div className={styles.loadMoreBar}>
                    <div className={styles.loadMoreMeta}>
                      已加载 {displayItems.length}/{publicTotal}
                    </div>
                    <button
                      type="button"
                      className={styles.loadMoreButton}
                      onClick={() => void loadMorePublic()}
                      disabled={loading || publicLoadingMore || !publicHasMore}
                    >
                      {publicLoadingMore ? "加载中..." : publicHasMore ? "加载更多" : "没有更多了"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <UploadResourceModal
        open={scope === "library" && uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={async (formData, opts) => {
          const file = formData.get("file")
          const type = formData.get("type")
          const name = formData.get("name")
          const description = formData.get("description")
          const tags = formData.get("tags")
          const applicableScenes = formData.get("applicableScenes")

          const isLarge = file instanceof File && file.size > 8 * 1024 * 1024
          const canChunk = file instanceof File && typeof type === "string" && type.trim()
          if (isLarge && canChunk) {
            let aborted = false
            let currentAbort: (() => void) | null = null
            let uploadId: string | null = null

            const abortAll = () => {
              aborted = true
              currentAbort?.()
              if (uploadId) {
                void fetch("/api/library/public-resources/upload-abort", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ uploadId })
                })
              }
            }
            opts?.onAbort?.(abortAll)

            const initRes = await fetch("/api/library/public-resources/upload-init", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                type,
                fileName: file.name,
                contentType: file.type || "application/octet-stream",
                size: file.size,
                name: typeof name === "string" ? name : undefined,
                description: typeof description === "string" ? description : undefined,
                tags: typeof tags === "string" ? tags : undefined,
                applicableScenes: typeof applicableScenes === "string" ? applicableScenes : undefined
              })
            })
            const initJson = (await initRes.json().catch(() => null)) as any
            if (!initRes.ok || !initJson?.ok) throw new Error(initJson?.error?.message ?? `初始化上传失败（${initRes.status}）`)

            uploadId = String(initJson.data?.uploadId ?? "")
            const chunkSize = Number(initJson.data?.chunkSize ?? 0)
            const totalChunks = Number(initJson.data?.totalChunks ?? 0)
            if (!uploadId || !chunkSize || !totalChunks) throw new Error("初始化上传失败：参数缺失")

            for (let i = 0; i < totalChunks; i++) {
              if (aborted) throw new Error("上传已取消")
              const start = i * chunkSize
              const end = Math.min(file.size, start + chunkSize)
              const blob = file.slice(start, end)
              const { promise, abort } = putBlobWithProgress({
                url: `/api/library/public-resources/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&index=${i}`,
                blob,
                onProgress: (p) => {
                  const loadedOverall = start + p.loaded
                  const percent = file.size > 0 ? Math.round((loadedOverall / file.size) * 100) : null
                  opts?.onProgress?.({ loaded: loadedOverall, total: file.size, percent })
                }
              })
              currentAbort = abort
              const { status, json } = await promise
              const anyJson = json as any
              if (!anyJson?.ok) throw new Error(anyJson?.error?.message ?? `上传分片失败（${status}）`)
              opts?.onProgress?.({ loaded: end, total: file.size, percent: Math.round((end / file.size) * 100) })
            }

            const doneRes = await fetch("/api/library/public-resources/upload-complete", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ uploadId })
            })
            const doneJson = (await doneRes.json().catch(() => null)) as any
            if (!doneRes.ok || !doneJson?.ok) throw new Error(doneJson?.error?.message ?? `完成上传失败（${doneRes.status}）`)
            await refreshPublicData()
            return
          }

          const { promise, abort } = postFormDataWithProgress({
            url: "/api/library/public-resources/upload",
            formData,
            onProgress: opts?.onProgress
          })
          opts?.onAbort?.(abort)
          const { status, json } = await promise
          const anyJson = json as any
          if (!anyJson?.ok) throw new Error(anyJson?.error?.message ?? `上传失败（${status}）`)
          await refreshPublicData()
        }}
      />

      <AiGenerateResourceModal
        open={scope === "library" && aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={async (input) => {
          const res = await aiGeneratePublicResource({
            type: mapAiTypeToDbType(input.type),
            prompt: input.prompt,
            name: input.name,
            description: input.description,
            tags: input.tags,
            applicableScenes: input.applicableScenes
          })
          if (!res.success) throw new Error(res.message)
          await refreshPublicData()
        }}
      />

      <PublicResourcePreviewModal
        open={(scope === "library" || scope === "shared") && previewItem != null}
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
      <BulkActionBar
        selectedCount={scope === "library" ? selectedIds.size : 0}
        deleting={bulkDeleting}
        onClear={clearSelected}
        onDelete={scope === "library" ? openPublicBulkDeleteConfirm : undefined}
      />
      <StoryContentModal
        open={scope === "my" && storyContentItem != null}
        storyId={storyContentItem?.id ?? null}
        storyTitle={storyContentItem?.title}
        onClose={() => setStoryContentItem(null)}
      />
      <ConfirmModal
        open={scope === "my" && storyDeleteConfirm != null}
        title="删除剧本"
        message={`确定删除选中的 ${storyDeleteConfirm?.ids.length ?? 0} 个剧本吗？此操作不可恢复。`}
        confirming={storyDeleting}
        onCancel={() => setStoryDeleteConfirm(null)}
        onConfirm={() => void confirmMyStoriesDelete()}
      />
      <ConfirmModal
        open={scope === "library" && publicDeleteConfirm != null}
        title="删除素材"
        message={`确定删除选中的 ${publicDeleteConfirm?.ids.length ?? 0} 项素材吗？此操作不可恢复。`}
        confirming={bulkDeleting}
        onCancel={() => setPublicDeleteConfirm(null)}
        onConfirm={() => void confirmPublicBulkDelete()}
      />
    </div>
  )
}
