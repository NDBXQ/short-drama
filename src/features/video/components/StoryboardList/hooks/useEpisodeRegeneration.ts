import { useCallback, useRef, useState } from "react"
import type { StoryboardItem } from "../../../types"
import { fetchStoryboards, generateStoryboardPrompts, generateStoryboardText } from "../../../api/generation"
import { extractReferenceImagePrompts } from "../../../utils/referenceImagePrompts"
import { startReferenceImageJob, waitReferenceImageJob } from "../../../utils/referenceImageAsync"
import { chunkArray, normalizeCategory, toEntityKey } from "../../../utils/autoGenerateUtils"

export function useEpisodeRegeneration(params: {
  storyId?: string
  activeEpisode?: string
  outlineById?: Record<string, { id: string; sequence: number; outlineText: string; originalText: string }>
  setItems: React.Dispatch<React.SetStateAction<StoryboardItem[]>>
  reloadShots: (episodeId: string) => Promise<void>
  generateScriptForItem: (item: StoryboardItem) => Promise<unknown>
  runTasksWithConcurrency: (tasks: Array<() => Promise<void>>, limit: number) => Promise<void>
}): {
  regenStatus: { status: "idle" | "running" | "success" | "error"; message: string }
  handleRegenerateActiveEpisode: () => Promise<void>
} {
  const { storyId, activeEpisode, outlineById, setItems, reloadShots, generateScriptForItem, runTasksWithConcurrency } = params

  const [regenStatus, setRegenStatus] = useState<{ status: "idle" | "running" | "success" | "error"; message: string }>({
    status: "idle",
    message: ""
  })

  const regenProgressRef = useRef<{ promptDone: number; promptTotal: number; assetDone: number; assetTotal: number }>({
    promptDone: 0,
    promptTotal: 0,
    assetDone: 0,
    assetTotal: 0
  })

  const handleRegenerateActiveEpisode = useCallback(async () => {
    if (regenStatus.status === "running") return
    if (!storyId) {
      setRegenStatus({ status: "error", message: "缺少 storyId" })
      return
    }
    if (!activeEpisode) {
      setRegenStatus({ status: "error", message: "未选择剧集" })
      return
    }
    const outline = outlineById?.[activeEpisode]
    if (!outline) {
      setRegenStatus({ status: "error", message: "缺少大纲数据" })
      return
    }

    const setCombinedProgress = () => {
      const p = regenProgressRef.current
      const parts: string[] = []
      if (p.promptTotal > 0) parts.push(`提示词 ${Math.min(p.promptTotal, p.promptDone)}/${p.promptTotal}`)
      if (p.assetTotal > 0) parts.push(`参考图 ${Math.min(p.assetTotal, p.assetDone)}/${p.assetTotal}`)
      setRegenStatus({ status: "running", message: parts.join(" · ") || "处理中…" })
    }

    setRegenStatus({ status: "running", message: "生成分镜文本…" })
    try {
      await generateStoryboardText(activeEpisode, outline.outlineText, outline.originalText)

      setRegenStatus({ status: "running", message: "加载分镜列表…" })
      const refreshed = await fetchStoryboards(storyId, activeEpisode)
      setItems(refreshed)

      const scriptCandidates = refreshed.filter((it) => Boolean(it.storyboard_text?.trim()))
      let scriptDone = 0
      let scriptFailed = 0
      setRegenStatus({ status: "running", message: `生成分镜脚本 0/${scriptCandidates.length}` })

      await runTasksWithConcurrency(
        scriptCandidates.map((it) => async () => {
          const result = await generateScriptForItem(it)
          if (result) scriptDone += 1
          else scriptFailed += 1
          setRegenStatus({ status: "running", message: `生成分镜脚本 ${scriptDone + scriptFailed}/${scriptCandidates.length}` })
        }),
        5
      )

      const scriptedItems = await fetchStoryboards(storyId, activeEpisode)
      setItems(scriptedItems)

      regenProgressRef.current = { promptDone: 0, promptTotal: scriptedItems.length, assetDone: 0, assetTotal: 0 }
      setCombinedProgress()

      const runPromptsTask = async () => {
        await runTasksWithConcurrency(
          scriptedItems.map((it) => async () => {
            try {
              const ok = await generateStoryboardPrompts(it.id)
              if (!ok) throw new Error("prompt_failed")
            } finally {
              regenProgressRef.current.promptDone += 1
              setCombinedProgress()
            }
          }),
          5
        )
      }

      const runAssetsTask = async () => {
        const globalPromptByKey = new Map<string, { name: string; category: "background" | "role" | "item"; prompt: string; description: string }>()
        for (const item of scriptedItems) {
          const extracted = extractReferenceImagePrompts(item.scriptContent)
          if (!Array.isArray(extracted) || extracted.length === 0) continue
          for (const p of extracted) {
            const category = normalizeCategory(p.category)
            const name = (p.name ?? "").trim()
            const prompt = (p.prompt ?? "").trim()
            if (!name || !prompt) continue
            const description = (p.description ?? "").trim() || prompt
            const key = toEntityKey(category, name)
            if (!globalPromptByKey.has(key)) globalPromptByKey.set(key, { name, category, prompt, description })
          }
        }
        const globalPrompts = Array.from(globalPromptByKey.values())
        const batches = chunkArray(globalPrompts, 50)
        regenProgressRef.current.assetTotal = batches.length
        setCombinedProgress()

        for (const batch of batches) {
          const jobId = await startReferenceImageJob({
            storyId,
            prompts: batch.map((p) => ({ name: p.name, prompt: p.prompt, description: p.description, category: p.category })),
            forceRegenerate: true
          })
          await waitReferenceImageJob(jobId)
          regenProgressRef.current.assetDone += 1
          setCombinedProgress()
        }
      }

      await Promise.allSettled([runPromptsTask(), runAssetsTask()])

      setRegenStatus({ status: "running", message: "刷新列表…" })
      await reloadShots(activeEpisode)
      setRegenStatus({ status: "success", message: "重新生成完成" })
      window.setTimeout(() => setRegenStatus({ status: "idle", message: "" }), 1500)
    } catch (e) {
      const anyErr = e as { message?: string }
      setRegenStatus({ status: "error", message: anyErr?.message ?? "重新生成失败" })
    }
  }, [activeEpisode, generateScriptForItem, outlineById, regenStatus.status, reloadShots, runTasksWithConcurrency, setItems, storyId])

  return { regenStatus, handleRegenerateActiveEpisode }
}
