import { useCallback } from "react"
import { useRouter } from "next/navigation"
import type { StoryboardItem } from "../../types"
import { logger } from "@/shared/logger"
import { useAutoGenerateState } from "./useAutoGenerateState"
import { runStoryboardTextFlow } from "./flows/textFlow"
import { runScriptFlow } from "./flows/scriptFlow"
import { runAssetFlow } from "./flows/assetFlow"

export function useAutoGenerateLogic(
  state: ReturnType<typeof useAutoGenerateState>,
  params: {
    storyId?: string
    outlineId?: string
    outlineById: Record<string, { id: string; outlineText: string; originalText: string }> | null
    setItems: (items: StoryboardItem[]) => void
    reloadShots: (outlineId: string) => Promise<void>
    generateScriptForItem: (item: StoryboardItem) => Promise<unknown>
    runTasksWithConcurrency: (tasks: Array<() => Promise<void>>, concurrency: number) => Promise<void>
  }
) {
  const router = useRouter()
  const {
    setIsAutoGenerating,
    setGenerationStage,
    setGenerationEpisodeId,
    setTextBatchMeta,
    setScriptSummary,
    setPromptSummary,
    setAssetSummary,
    setEpisodeProgressById,
    setScriptEntityCatalog,
    activeEpisodeRef,
    entitySetsRef
  } = state

  const { storyId, outlineId, outlineById, setItems, reloadShots, generateScriptForItem, runTasksWithConcurrency } = params

  const handleAutoGenerate = useCallback(async (mode: "all" | "script") => {
    if (!outlineById || Object.keys(outlineById).length === 0 || !storyId) return
    const preferredActiveEpisodeId = mode === "script" && outlineId ? outlineId : activeEpisodeRef.current
    setIsAutoGenerating(true)
    setGenerationStage("clearing")
    setGenerationEpisodeId(preferredActiveEpisodeId)
    setTextBatchMeta(null)
    setScriptSummary(null)
    setPromptSummary(null)
    setAssetSummary(null)
    setEpisodeProgressById({})
    setScriptEntityCatalog({ background: [], role: [], item: [] })
    entitySetsRef.current = { background: new Set(), role: new Set(), item: new Set() }

    const payloads =
      mode === "script" && outlineId
        ? Object.values(outlineById)
            .map((o) => ({ outlineId: o.id, outline: o.outlineText, original: o.originalText }))
            .filter((p) => p.outlineId === outlineId && p.outline && p.original)
        : Object.values(outlineById)
            .map((o) => ({ outlineId: o.id, outline: o.outlineText, original: o.originalText }))
            .filter((p) => p.outlineId && p.outline && p.original)

    if (payloads.length === 0) {
      setIsAutoGenerating(false)
      return
    }

    setItems([])

    const start = performance.now()

    try {
      // 1. Text Flow
      const {
        outlineIds,
        preferredEpisodeId,
        itemsByOutlineId,
        outlineIdByStoryboardId
      } = await runStoryboardTextFlow({
        filteredPayloads: payloads,
        storyId,
        activeEpisodeId: preferredActiveEpisodeId,
        setTextBatchMeta,
        setEpisodeProgressById,
        setGenerationStage,
        setGenerationEpisodeId,
        setItems,
        reloadShots
      })

      const allItems = outlineIds.flatMap((id) => itemsByOutlineId.get(id) ?? [])
      if (allItems.length === 0) {
        setIsAutoGenerating(false)
        return
      }

      // 2. Script Flow
      await runScriptFlow({
        allItems,
        outlineIds,
        itemsByOutlineId,
        outlineIdByStoryboardId,
        preferredEpisodeId,
        entitySetsRef,
        runTasksWithConcurrency,
        generateScriptForItem,
        setGenerationStage,
        setScriptSummary,
        setEpisodeProgressById
      })

      await runAssetFlow({
        storyId,
        outlineIds,
        outlineIdByStoryboardId,
        preferredEpisodeId,
        generateReferenceImages: mode === "all",
        runTasksWithConcurrency,
        setGenerationStage,
        setScriptEntityCatalog,
        setPromptSummary,
        setAssetSummary,
        setEpisodeProgressById
      })

      setGenerationStage("done")
      await reloadShots(preferredEpisodeId)

      const url = new URL(window.location.href)
      url.searchParams.delete("autoGenerate")
      router.replace(url.pathname + url.search)

      setIsAutoGenerating(false)
    } catch (err) {
      const durationMs = Math.round(performance.now() - start)
      const anyErr = err as { name?: string; message?: string }
      setGenerationStage("error")
      logger.error({
        event: "storyboard_text_batch_error",
        module: "video",
        traceId: "client",
        message: "自动生成流程异常",
        durationMs,
        errorName: anyErr?.name,
        errorMessage: anyErr?.message
      })
      alert("自动生成流程部分失败，请查看日志")
      setIsAutoGenerating(false)
    }
  }, [
    activeEpisodeRef,
    entitySetsRef,
    generateScriptForItem,
    outlineId,
    outlineById,
    reloadShots,
    router,
    runTasksWithConcurrency,
    setAssetSummary,
    setEpisodeProgressById,
    setGenerationEpisodeId,
    setGenerationStage,
    setIsAutoGenerating,
    setItems,
    setPromptSummary,
    setScriptEntityCatalog,
    setScriptSummary,
    setTextBatchMeta,
    storyId
  ])

  return handleAutoGenerate
}
