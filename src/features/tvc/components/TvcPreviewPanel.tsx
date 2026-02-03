"use client"

import { Download, Sparkles } from "lucide-react"
import { PenLine } from "lucide-react"
import { useMemo, useState, type ReactElement } from "react"
import styles from "./TvcPreviewPanel.module.css"
import type { TvcPreviewTab } from "@/features/tvc/types"
import type { TimelineShot } from "@/features/tvc/components/TvcTimelinePanel"

export function TvcPreviewPanel({
  activeTab,
  onTabChange,
  selectedStyleName,
  shots,
  isShotlistLoading,
  images,
  videos,
  activeShot,
  finalVideoUrl,
  onAssembleVideo,
  assemblingVideo
}: {
  activeTab: TvcPreviewTab
  onTabChange: (tab: TvcPreviewTab) => void
  selectedStyleName: string
  shots: Array<{ id: string; sequence: number; storyboardText: string }>
  isShotlistLoading: boolean
  images?: Array<{ url: string; desc: string; category: string; type: string }>
  videos?: Array<{ url: string; title: string; duration: string }>
  activeShot?: TimelineShot | null
  finalVideoUrl?: string | null
  onAssembleVideo?: () => void
  assemblingVideo?: boolean
}): ReactElement {
  const imageList = images ?? []
  const videoList = videos ?? []
  const selected = activeShot ?? null
  const selectedVideoUrl = selected?.videoInfo?.url ? String(selected.videoInfo.url) : ""
  const selectedFirstImageUrl = selected?.frames?.first?.url ? String(selected.frames.first.url) : ""
  const selectedLastImageUrl = selected?.frames?.last?.url ? String(selected.frames.last.url) : ""
  const selectedFirstPrompt = selected?.frames?.first?.prompt ? String(selected.frames.first.prompt) : ""
  const selectedLastPrompt = selected?.frames?.last?.prompt ? String(selected.frames.last.prompt) : ""
  const selectedScriptText = useMemo(() => {
    if (!selected?.scriptContent) return ""
    if (typeof selected.scriptContent !== "object") return String(selected.scriptContent)

    const raw = selected.scriptContent as Record<string, unknown>
    const record: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k ?? "")
        .replace(/[\u00A0\s]+/g, "")
        .replace(/[：:]+$/g, "")
        .trim()
      if (!key) continue
      const val = String(v ?? "").trim()
      if (!val) continue
      record[key] = val
    }
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = record[k] ?? ""
        if (v) return v
      }
      return ""
    }

    const camera = pick("镜头类型", "镜头", "镜头类别", "shot_type", "type")
    const scene = pick("画面描述", "场景描述", "描述", "画面", "storyboard_text", "description", "内容")
    const action = pick("动作描述", "动作", "action", "action_description")
    const dialog = pick("台词/旁白", "台词", "旁白", "台词旁白", "dialogue", "voice_over", "voiceover", "旁白时间", "台词时间")
    const duration = pick("时长", "duration", "duration_sec", "durationSeconds", "秒")

    const lines: string[] = []
    if (camera) lines.push(`镜头类型: ${camera}`)
    if (scene) lines.push(`画面描述: ${scene}`)
    if (action) lines.push(`动作描述: ${action}`)
    if (dialog) lines.push(`台词/旁白: ${dialog}`)
    if (duration) lines.push(`时长: ${duration}`)
    if (lines.length > 0) return lines.join("\n")

    return Object.entries(record).map(([k, v]) => `${k}: ${v}`).join("\n")
  }, [selected?.scriptContent])

  const selectedImage = useMemo(() => {
    if (!selected) return { url: "", prompt: "" }
    if (selectedFirstImageUrl) return { url: selectedFirstImageUrl, prompt: selectedFirstPrompt }
    if (selectedLastImageUrl) return { url: selectedLastImageUrl, prompt: selectedLastPrompt }
    return { url: "", prompt: "" }
  }, [selected, selectedFirstImageUrl, selectedFirstPrompt, selectedLastImageUrl, selectedLastPrompt])

  const [promptOpen, setPromptOpen] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")

  const openPrompt = () => {
    setPromptDraft(selectedImage.prompt || "")
    setPromptOpen(true)
  }

  const hasAnyShotVideo = Array.isArray(shots) && shots.some((s) => {
    const anyShot = s as any
    return Boolean(anyShot?.videoInfo?.url)
  })

  return (
    <div className={styles.panel}>
      <div className={styles.topbar}>
        <div className={styles.tabs} role="tablist" aria-label="工作区切换">
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "shotlist" ? styles.tabActive : ""}`}
            onClick={() => onTabChange("shotlist")}
          >
            Shotlist
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "image" ? styles.tabActive : ""}`} onClick={() => onTabChange("image")}>
            Image
          </button>
          <button type="button" className={`${styles.tab} ${activeTab === "video" ? styles.tabActive : ""}`} onClick={() => onTabChange("video")}>
            Video
          </button>
        </div>

        <div className={styles.actions}>
          {activeTab === "video" && !selected ? (
            <button type="button" className={styles.actionBtn} onClick={() => onAssembleVideo?.()} disabled={Boolean(assemblingVideo) || !hasAnyShotVideo}>
              <Download size={16} />
              {assemblingVideo ? "合成中..." : "生成成片"}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.canvas}>
        <div className={styles.stage}>
          <div className={styles.stageContent}>
            <div className={styles.stagePane}>
              {activeTab === "shotlist" ? (
                isShotlistLoading ? (
                  <div>
                    <div className={styles.emptyTitle}>Shotlist Loading…</div>
                    <div className={styles.emptySub}>正在加载或生成镜头表。</div>
                  </div>
                ) : selected ? (
                  <div className={styles.shotDetailFill} aria-label="分镜详情">
                    <div className={styles.shotDetailHeader}>
                      <div className={styles.shotDetailTitle}>Shot {String(selected.sequence).padStart(2, "0")}</div>
                      <div className={styles.pill}>
                        <Sparkles size={14} />
                        Style: {selectedStyleName}
                      </div>
                    </div>
                    <div className={styles.shotDetailBody}>
                      {selectedScriptText ? <pre className={styles.shotDetailPre}>{selectedScriptText}</pre> : <div className={styles.shotDetailText}>{selected.storyboardText}</div>}
                    </div>
                  </div>
                ) : shots.length === 0 ? (
                  <div>
                    <div className={styles.emptyTitle}>暂无 Shotlist</div>
                    <div className={styles.emptySub}>请在左侧 Creative Brief 中点击“生成 Shotlist”。</div>
                  </div>
                ) : (
                  <div className={styles.shotlist} aria-label="镜头表">
                    {shots.map((s) => (
                      <div key={s.id} className={styles.shotRow}>
                        <div>
                          <div className={styles.cellLabel}>Shot</div>
                          <div className={styles.cellValue}>{String(s.sequence).padStart(2, "0")}</div>
                        </div>
                        <div>
                          <div className={styles.cellLabel}>Type</div>
                          <div className={styles.cellValue}>Scene</div>
                        </div>
                        <div>
                          <div className={styles.cellLabel}>Description</div>
                          <div className={styles.cellValue}>{s.storyboardText}</div>
                        </div>
                        <div className={styles.pill}>
                          <Sparkles size={14} />
                          Style: {selectedStyleName}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : activeTab === "image" ? (
                selected ? (
                  selectedImage.url ? (
                    <div className={styles.selectedImageWrap} aria-label="分镜图片">
                      <img className={styles.selectedImage} src={selectedImage.url} alt={`shot_${selected.sequence}_image`} />
                      <button type="button" className={styles.imageActionBtn} aria-label="编辑/查看提示词" title="编辑/查看提示词" onClick={openPrompt}>
                        <PenLine size={16} />
                      </button>
                      {promptOpen ? (
                        <div className={styles.promptOverlay} role="dialog" aria-label="提示词">
                          <div className={styles.promptDialog}>
                            <div className={styles.promptHeader}>
                              <div className={styles.promptTitle}>Shot {String(selected.sequence).padStart(2, "0")} 提示词</div>
                              <button type="button" className={styles.promptCloseBtn} aria-label="关闭" onClick={() => setPromptOpen(false)}>
                                ×
                              </button>
                            </div>
                            <textarea className={styles.promptTextarea} value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} />
                            <div className={styles.promptActions}>
                              <button
                                type="button"
                                className={styles.promptBtn}
                                onClick={() => {
                                  try {
                                    void navigator.clipboard.writeText(promptDraft || "")
                                  } catch {}
                                }}
                              >
                                复制提示词
                              </button>
                              <a className={`${styles.promptBtn} ${styles.promptBtnPrimary}`} href={selectedImage.url} target="_blank" rel="noreferrer">
                                查看原图
                              </a>
                            </div>
                          </div>
                          <button type="button" className={styles.promptBackdrop} aria-label="关闭遮罩" onClick={() => setPromptOpen(false)} />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <div className={styles.emptyTitle}>该分镜暂无图片</div>
                      <div className={styles.emptySub}>生成首帧或关键帧后会在这里展示。</div>
                    </div>
                  )
                ) : imageList.length === 0 ? (
                  <div>
                    <div className={styles.emptyTitle}>暂无图片</div>
                    <div className={styles.emptySub}>等待智能体输出参考图，或在画布的“参考图生成”步骤里生成。</div>
                  </div>
                ) : (
                  <div className={styles.assetGrid} aria-label="图片列表">
                    {imageList.map((img, idx) => (
                      <div key={`${img.url}_${idx}`} className={styles.assetCard}>
                        <img className={styles.assetThumb} src={img.url} alt={img.desc || img.category || img.type || "image"} />
                        <div className={styles.assetMeta}>
                          {img.desc ? <div className={styles.assetLine}>{img.desc}</div> : null}
                          {img.category ? <div className={styles.assetLine}>分类：{img.category}</div> : null}
                          {img.type ? <div className={styles.assetLine}>类型：{img.type}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                selected ? (
                  selectedVideoUrl ? (
                    <div className={styles.selectedVideoWrap} aria-label="分镜视频">
                      <video className={styles.selectedVideo} src={selectedVideoUrl} controls playsInline />
                    </div>
                  ) : (
                    <div>
                      <div className={styles.emptyTitle}>该分镜暂无视频</div>
                      <div className={styles.emptySub}>生成视频片段后会在这里展示。</div>
                    </div>
                  )
                ) : finalVideoUrl ? (
                  <div className={styles.selectedVideoWrap} aria-label="成片预览">
                    <video className={styles.selectedVideo} src={String(finalVideoUrl)} controls playsInline />
                  </div>
                ) : videoList.length === 0 ? (
                  <div>
                    <div className={styles.emptyTitle}>暂无视频</div>
                    <div className={styles.emptySub}>等待智能体输出视频片段，或在画布的“视频生成”步骤里生成。</div>
                  </div>
                ) : (
                  <div className={styles.videoList} aria-label="视频列表">
                    {videoList.map((v, idx) => (
                      <div key={`${v.url}_${idx}`} className={styles.videoCard}>
                        <video className={styles.videoPlayer} src={v.url} controls playsInline />
                        <div className={styles.videoMeta}>
                          {v.title ? <div className={styles.videoTitle}>{v.title}</div> : null}
                          {v.duration ? <div className={styles.videoSub}>时长：{v.duration}</div> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
