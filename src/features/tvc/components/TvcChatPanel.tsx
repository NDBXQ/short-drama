"use client"

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react"
import styles from "./TvcChatPanel.module.css"
import type { ChatMessage } from "@/features/tvc/types"
import { parseAgentBlocks, parseResponseXml } from "@/features/tvc/agent/parseAgentBlocks"
import type { TvcAgentSectionItem, TvcAgentStep, TvcAgentStepContent } from "@/features/tvc/agent/types"
import type { TvcStepId } from "@/features/tvc/types"
import { getOrCreateTvcSessionId } from "@/features/tvc/agent/session"

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`
}

function formatAgentError(message: string): string {
  return `<response>\n❌ 执行出错：${message}\n\n请选择以下操作：\n👉 输入"重试"重新执行此步骤\n👉 输入"返回"返回上一步骤\n</response>`
}

function renderAssistantContent(input: { text: string; blocks?: ChatMessage["blocks"]; onAction: (command: string) => void }): ReactElement {
  const blocks = input.blocks ?? []
  const responses = blocks.filter((b) => b.kind === "response")
  if (responses.length === 0) {
    const raw = input.text ?? ""
    const looksLikeXml = raw.includes("<step") || raw.includes("</step>") || raw.includes("<response") || raw.includes("</response>")
    if (looksLikeXml) return <></>
    return <>{raw}</>
  }

  const last = responses[responses.length - 1]
  if (!last) return <></>
  return (
    <div className={styles.inlineWrap}>
      {(() => {
        const parsed = last.response ?? parseResponseXml(last.raw)
        const text = parsed?.text ?? last.raw
        const actions = (parsed?.actions ?? []).filter((a) => a.command !== "修改")
        return (
          <div>
            <div className={styles.inlineText}>{text}</div>
            {actions.length ? (
              <div className={styles.inlineActions}>
                {actions.map((a, i) => (
                  <button
                    key={`${a.command}_${i}`}
                    type="button"
                    className={`${styles.inlineActionBtn} ${i === 0 ? styles.inlineActionBtnPrimary : ""}`}
                    onClick={() => input.onAction(a.command)}
                  >
                    {a.command}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      })()}
    </div>
  )
}

export function TvcChatPanel({
  selectedStyleName,
  focusToken,
  onUserMessage,
  onAgentStep,
  projectId,
  initialMessages
}: {
  selectedStyleName: string
  focusToken?: number
  onUserMessage?: (text: string) => void
  onAgentStep?: (id: TvcStepId, step: TvcAgentStep) => void
  projectId?: string | null
  initialMessages?: ChatMessage[]
}): ReactElement {
  const [input, setInput] = useState("")
  const [quickActions, setQuickActions] = useState<string[]>([])
  const defaultMessages = useMemo<ChatMessage[]>(() => {
    return [
      {
        id: createId("m"),
        role: "assistant",
        text:
          "我可以按你想要的 vibe 来生成 TVC 的结构与镜头节奏。\n\n先告诉我：\n1) 产品是什么？（一句话）\n2) 目标平台与时长？（15/30/60s）\n3) 想要的风格（参考某个广告/品牌也行）"
      }
    ]
  }, [])
  const [messages, setMessages] = useState<ChatMessage[]>(() => (initialMessages && initialMessages.length > 0 ? initialMessages : defaultMessages))
  const abortRef = useRef<AbortController | null>(null)
  const [streaming, setStreaming] = useState(false)
  const lastStepXmlByCanvasIdRef = useRef<Partial<Record<TvcStepId, string>>>({})
  const lastPartialProgressKeyByCanvasIdRef = useRef<Partial<Record<TvcStepId, string>>>({})
  const lastSavedAssistantResponseXmlRef = useRef<string | null>(null)
  const savedUserTextRef = useRef<Set<string>>(new Set())
  const savedAssistantResponseRef = useRef<Set<string>>(new Set())
  const pendingPersistRef = useRef<{
    steps: Array<{ stepId: string; title?: string; rawXml: string; content?: Record<string, unknown> }>
    messages: Array<{ role: "user" | "assistant"; content: string }>
  }>({
    steps: [],
    messages: []
  })
  const persistTimerRef = useRef<number | null>(null)

  const threadRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const scrollToBottom = () => {
    const el = threadRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  useEffect(() => {
    setMessages(initialMessages && initialMessages.length > 0 ? initialMessages : defaultMessages)
    lastStepXmlByCanvasIdRef.current = {}
    lastPartialProgressKeyByCanvasIdRef.current = {}
    lastSavedAssistantResponseXmlRef.current = null
    savedUserTextRef.current = new Set()
    savedAssistantResponseRef.current = new Set()
    pendingPersistRef.current = { steps: [], messages: [] }
    setQuickActions([])
  }, [projectId, initialMessages, defaultMessages])

  useEffect(() => {
    if (!focusToken) return
    textareaRef.current?.focus()
  }, [focusToken])

  const canSend = input.trim().length > 0

  const helperText = useMemo(() => {
    return `当前风格锁：${selectedStyleName}。你可以说“更高级一点，但更克制”“更快节奏，但不要太吵”。`
  }, [selectedStyleName])

  const mapAgentStepId = (rawId: string): TvcStepId | null => {
    const id = rawId.trim()
    if (id === "step-0" || id === "0") return "step-0"
    if (id === "step-1" || id === "1") return "step-1"
    if (id === "step-2" || id === "2") return "step-2"
    if (id === "step-3" || id === "3") return "step-3"
    if (id === "step-4" || id === "4") return "step-4"
    if (id === "step-5" || id === "5") return "step-5"
    return null
  }

  const extractFirstTag = (xml: string, tag: string): string | null => {
    const start = xml.indexOf(`<${tag}`)
    if (start < 0) return null
    const end = xml.indexOf(`</${tag}>`, start)
    if (end < 0) return null
    return xml.slice(start, end + (`</${tag}>`.length))
  }

  const stripXmlTags = (v: string): string => {
    return (v ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  const getClosedTagText = (xml: string, tag: string): string | null => {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
    const m = xml.match(re)
    if (!m) return null
    const text = stripXmlTags(m[1] ?? "")
    return text || null
  }

  const parseFieldsFromXml = (xml: string): Array<{ name: string; value: string }> => {
    const out: Array<{ name: string; value: string }> = []
    const re = /<field\b[^>]*\bname=["']([^"']+)["'][^>]*>([\s\S]*?)<\/field>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) {
      const name = (m[1] ?? "").trim()
      const value = stripXmlTags(m[2] ?? "")
      if (!name || !value) continue
      out.push({ name, value })
    }
    return out
  }

  const parseRecordFromItemXml = (itemXml: string): Record<string, string> => {
    const record: Record<string, string> = {}
    const fieldsWrap = itemXml.match(/<fields\b[^>]*>([\s\S]*?)<\/fields>/i)
    if (fieldsWrap?.[1]) {
      const items = fieldsWrap[1]
      const reItem = /<(item)\b[^>]*>([\s\S]*?)<\/\1>/gi
      let m: RegExpExecArray | null
      while ((m = reItem.exec(items))) {
        for (const f of parseFieldsFromXml(m[2] ?? "")) record[f.name] = f.value
      }
      if (Object.keys(record).length > 0) return record
    }
    for (const f of parseFieldsFromXml(itemXml)) record[f.name] = f.value
    return record
  }

  const extractClosedItemsInContainer = (xml: string, containerTag: string, itemTags: string[]): string[] => {
    const start = xml.indexOf(`<${containerTag}`)
    if (start < 0) return []
    const slice = xml.slice(start)
    const closeIdx = slice.indexOf(`</${containerTag}>`)
    const scoped = closeIdx >= 0 ? slice.slice(0, closeIdx + (`</${containerTag}>`.length)) : slice
    const tags = itemTags.join("|")
    const re = new RegExp(`<(${tags})\\b[\\s\\S]*?<\\/\\1>`, "gi")
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(scoped))) out.push(m[0])
    return out
  }

  const parsePartialStepContent = (partialStepXml: string): { title: string; content: TvcAgentStepContent; key: string } => {
    const title = getClosedTagText(partialStepXml, "title") ?? ""
    const prompt = getClosedTagText(partialStepXml, "prompt") ?? ""

    const sectionsItems = extractClosedItemsInContainer(partialStepXml, "sections", ["item", "section"])
    const sections: TvcAgentSectionItem[] = sectionsItems
      .map((itemXml, idx) => {
        const record = parseRecordFromItemXml(itemXml)
        const sectionName = (record["section_name"] ?? record["序号"] ?? "").trim() || `段落${idx + 1}`
        const fields = Object.entries(record)
          .filter(([k, v]) => k !== "section_name" && k !== "序号" && String(v ?? "").trim())
          .map(([name, value]) => ({ name, value }))
        if (fields.length === 0) return null
        return { sectionName, fields }
      })
      .filter(Boolean) as TvcAgentSectionItem[]

    const imagesItems = extractClosedItemsInContainer(partialStepXml, "images", ["item", "image"])
    const images = imagesItems
      .map((itemXml) => parseRecordFromItemXml(itemXml))
      .filter((r) => Object.keys(r).length > 0)

    const storyboardsItems = extractClosedItemsInContainer(partialStepXml, "storyboards", ["item", "video_clip", "storyboard"])
    const storyboards = storyboardsItems
      .map((itemXml) => parseRecordFromItemXml(itemXml))
      .filter((r) => Object.keys(r).length > 0)

    const videoClipsItems = extractClosedItemsInContainer(partialStepXml, "video_clips", ["item", "video_clip"])
    const videoClips = videoClipsItems
      .map((itemXml) => parseRecordFromItemXml(itemXml))
      .filter((r) => Object.keys(r).length > 0)

    const content: TvcAgentStepContent = {}
    if (prompt) content.prompt = prompt
    if (sections.length) content.sections = sections
    if (images.length) content.images = images as any
    if (storyboards.length) content.storyboards = storyboards
    if (videoClips.length) content.videoClips = videoClips

    const key = `${title}|p${prompt.length}|s${sections.length}|i${images.length}|sb${storyboards.length}|v${videoClips.length}`
    return { title, content, key }
  }

  const extractPartialStep = (raw: string): { canvasId: TvcStepId; partial: string; rawId: string } | null => {
    const start = raw.lastIndexOf("<step")
    if (start < 0) return null
    const end = raw.indexOf("</step>", start)
    if (end >= 0) return null

    const partial = raw.slice(start)
    const idMatch = partial.match(/<step[^>]*\sid=["']([^"']+)["']/i)
    const rawId = (idMatch?.[1] ?? "").trim()
    if (!rawId) return null
    const canvasId = mapAgentStepId(rawId)
    if (!canvasId) return null

    return { rawId, canvasId, partial }
  }

  const enqueuePersist = (patch: {
    steps?: Array<{ stepId: string; title?: string; rawXml: string; content?: Record<string, unknown> }>
    messages?: Array<{ role: "user" | "assistant"; content: string }>
  }) => {
    if (!projectId) return
    const p = pendingPersistRef.current
    if (patch.steps?.length) p.steps.push(...patch.steps)
    if (patch.messages?.length) p.messages.push(...patch.messages)
    if (persistTimerRef.current) return
    persistTimerRef.current = window.setTimeout(async () => {
      persistTimerRef.current = null
      const now = pendingPersistRef.current
      pendingPersistRef.current = { steps: [], messages: [] }
      if (now.steps.length === 0 && now.messages.length === 0) return
      await fetch(`/api/tvc/projects/${encodeURIComponent(projectId)}/creation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(now)
      }).catch(() => null)
    }, 300)
  }

  const sendText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (streaming) {
      abortRef.current?.abort()
      return
    }
    setInput("")
    setQuickActions([])
    onUserMessage?.(trimmed)
    if (!savedUserTextRef.current.has(trimmed)) {
      savedUserTextRef.current.add(trimmed)
      enqueuePersist({ messages: [{ role: "user", content: trimmed }] })
    }
    const userId = createId("m")
    const assistantId = createId("m")
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed },
      { id: assistantId, role: "assistant", text: "", blocks: [] }
    ])

    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController
    setStreaming(true)

    try {
      const sessionId = getOrCreateTvcSessionId(projectId)
      const res = await fetch("/api/tvc/agent/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: `当前风格锁：${selectedStyleName}\n${trimmed}`, sessionId, projectId }),
        signal: abortController.signal
      })

      const contentType = res.headers.get("content-type") ?? ""
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
      }

      if (!contentType.includes("text/event-stream") || !res.body) {
        throw new Error("服务端未返回流式响应")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let raw = ""
      let pending = ""
      let lastFlush = 0

      const flush = (force: boolean) => {
        const now = performance.now()
        if (!force && now - lastFlush < 60) return
        lastFlush = now
        if (!pending) return
        raw += pending
        pending = ""
        const allBlocks = parseAgentBlocks(raw)
        const embeddedResponseSet = new Set<string>()
        for (const b of allBlocks) {
          if (b.kind !== "step" || !b.step) continue
          const canvasId = mapAgentStepId(b.step.id)
          if (!canvasId) continue
          const prevXml = lastStepXmlByCanvasIdRef.current[canvasId]
          if (prevXml === b.raw) continue
          lastStepXmlByCanvasIdRef.current[canvasId] = b.raw
          lastPartialProgressKeyByCanvasIdRef.current[canvasId] = ""
          onAgentStep?.(canvasId, { ...b.step, id: canvasId })
          enqueuePersist({
            steps: [
              {
                stepId: canvasId,
                title: b.step.title ?? undefined,
                rawXml: b.raw,
                content: { ...((b.step.content ?? {}) as any), _schemaVersion: 1 }
              }
            ]
          })
          const embedded = extractFirstTag(b.raw, "response")
          if (embedded) embeddedResponseSet.add(embedded)
        }
        const blocks = [
          ...Array.from(embeddedResponseSet).map((xml) => ({ kind: "response" as const, raw: xml, response: parseResponseXml(xml) })),
          ...allBlocks.filter((b) => b.kind !== "step" && b.kind !== "text")
        ]

        const partial = extractPartialStep(raw)
        if (partial) {
          const parsed = parsePartialStepContent(partial.partial)
          const hasAny =
            Boolean(parsed.title) ||
            Boolean(parsed.content.prompt) ||
            Boolean(parsed.content.sections?.length) ||
            Boolean(parsed.content.images?.length) ||
            Boolean(parsed.content.storyboards?.length) ||
            Boolean(parsed.content.videoClips?.length)
          if (hasAny) {
            const prevKey = lastPartialProgressKeyByCanvasIdRef.current[partial.canvasId] ?? ""
            if (parsed.key !== prevKey) {
              lastPartialProgressKeyByCanvasIdRef.current[partial.canvasId] = parsed.key
              onAgentStep?.(partial.canvasId, { id: partial.canvasId, title: parsed.title, content: parsed.content })
            }
          }
        }

        const assistantXml = blocks.filter((b) => b.kind === "response").slice(-1)[0]?.raw ?? null
        const parsed = assistantXml ? parseResponseXml(assistantXml) : null
        const nextActions = (parsed?.actions ?? [])
          .map((a) => a.command)
          .filter((c) => c && c !== "修改")
        setQuickActions(nextActions)
        if (assistantXml && lastSavedAssistantResponseXmlRef.current !== assistantXml && !savedAssistantResponseRef.current.has(assistantXml)) {
          lastSavedAssistantResponseXmlRef.current = assistantXml
          savedAssistantResponseRef.current.add(assistantXml)
          enqueuePersist({ messages: [{ role: "assistant", content: assistantXml }] })
        }
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: raw, blocks } : m)))
        requestAnimationFrame(() => scrollToBottom())
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const idx = buffer.indexOf("\n\n")
          if (idx < 0) break
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)

          for (const line of block.split("\n")) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const dataPart = trimmed.slice("data:".length).trim()
            if (!dataPart) continue

            let payload: unknown
            try {
              payload = JSON.parse(dataPart)
            } catch {
              continue
            }

            if (!payload || typeof payload !== "object") continue
            const anyPayload = payload as Record<string, unknown>
            if (anyPayload.ok !== true) continue
            const data = anyPayload.data
            if (!data || typeof data !== "object") continue
            const anyData = data as Record<string, unknown>

            if (anyData.type === "delta") {
              const t = typeof anyData.text === "string" ? anyData.text : ""
              if (t) {
                pending += t
                flush(false)
              }
            }

            if (anyData.type === "error") {
              const msg = typeof anyData.message === "string" ? anyData.message : "执行失败"
              throw new Error(msg)
            }

            if (anyData.type === "result") {
              flush(true)
              const finalRaw = typeof anyData.raw === "string" ? anyData.raw : raw
              const allBlocks = parseAgentBlocks(finalRaw)
              const embeddedResponseSet = new Set<string>()
              for (const b of allBlocks) {
                if (b.kind !== "step" || !b.step) continue
                const canvasId = mapAgentStepId(b.step.id)
                if (!canvasId) continue
                const prevXml = lastStepXmlByCanvasIdRef.current[canvasId]
                if (prevXml === b.raw) continue
                lastStepXmlByCanvasIdRef.current[canvasId] = b.raw
                lastPartialProgressKeyByCanvasIdRef.current[canvasId] = ""
                onAgentStep?.(canvasId, { ...b.step, id: canvasId })
                enqueuePersist({
                  steps: [
                    {
                      stepId: canvasId,
                      title: b.step.title ?? undefined,
                      rawXml: b.raw,
                      content: { ...((b.step.content ?? {}) as any), _schemaVersion: 1 }
                    }
                  ]
                })
                const embedded = extractFirstTag(b.raw, "response")
                if (embedded) embeddedResponseSet.add(embedded)
              }
              const blocks = [
                ...Array.from(embeddedResponseSet).map((xml) => ({ kind: "response" as const, raw: xml, response: parseResponseXml(xml) })),
                ...allBlocks.filter((b) => b.kind !== "step" && b.kind !== "text")
              ]

              const assistantXml = blocks.filter((b) => b.kind === "response").slice(-1)[0]?.raw ?? null
              const parsed = assistantXml ? parseResponseXml(assistantXml) : null
              const nextActions = (parsed?.actions ?? [])
                .map((a) => a.command)
                .filter((c) => c && c !== "修改")
              setQuickActions(nextActions)
              if (assistantXml && lastSavedAssistantResponseXmlRef.current !== assistantXml && !savedAssistantResponseRef.current.has(assistantXml)) {
                lastSavedAssistantResponseXmlRef.current = assistantXml
                savedAssistantResponseRef.current.add(assistantXml)
                enqueuePersist({ messages: [{ role: "assistant", content: assistantXml }] })
              }
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: finalRaw, blocks } : m)))
              requestAnimationFrame(() => scrollToBottom())
            }
          }
        }
      }
    } catch (err) {
      const anyErr = err as { name?: string; message?: string }
      if (anyErr?.name === "AbortError") {
        const t = formatAgentError("操作已取消")
        const blocks = parseAgentBlocks(t).filter((b) => b.kind !== "step")
        const assistantXml = blocks.filter((b) => b.kind === "response").slice(-1)[0]?.raw ?? null
        if (assistantXml && lastSavedAssistantResponseXmlRef.current !== assistantXml && !savedAssistantResponseRef.current.has(assistantXml)) {
          lastSavedAssistantResponseXmlRef.current = assistantXml
          savedAssistantResponseRef.current.add(assistantXml)
          enqueuePersist({ messages: [{ role: "assistant", content: assistantXml }] })
        }
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: t, blocks } : m)))
      } else {
        const t = formatAgentError(anyErr?.message ?? "执行失败")
        const blocks = parseAgentBlocks(t).filter((b) => b.kind !== "step")
        const assistantXml = blocks.filter((b) => b.kind === "response").slice(-1)[0]?.raw ?? null
        if (assistantXml && lastSavedAssistantResponseXmlRef.current !== assistantXml && !savedAssistantResponseRef.current.has(assistantXml)) {
          lastSavedAssistantResponseXmlRef.current = assistantXml
          savedAssistantResponseRef.current.add(assistantXml)
          enqueuePersist({ messages: [{ role: "assistant", content: assistantXml }] })
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: t, blocks } : m))
        )
      }
    } finally {
      setStreaming(false)
    }
  }

  const send = async () => {
    await sendText(input)
  }

  const handleAction = async (command: string) => {
    await sendText(command)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>TVC Assistant</div>
        <div className={styles.statusRow}>
          <div className={styles.status}>{streaming ? "生成中" : "可输入"}</div>
        </div>
      </div>

      <div className={styles.thread} ref={threadRef} aria-label="对话记录">
        {messages.map((m) => {
          const wrapper = m.role === "user" ? `${styles.message} ${styles.messageUser}` : styles.message
          const bubble = m.role === "user" ? `${styles.bubble} ${styles.bubbleUser}` : styles.bubble
          const avatar = m.role === "user" ? `${styles.avatar} ${styles.avatarUser}` : styles.avatar
          return (
            <div key={m.id} className={wrapper}>
              <div className={avatar} aria-label={m.role === "user" ? "你" : "助手"} title={m.role === "user" ? "你" : "助手"} />
              <div className={bubble}>
                {m.role === "assistant" ? renderAssistantContent({ text: m.text, blocks: m.blocks, onAction: handleAction }) : m.text}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.composer}>
        {quickActions.length ? (
          <div className={styles.quickActions} aria-label="快捷操作">
            {quickActions.map((a, idx) => (
              <button key={`${a}_${idx}`} type="button" className={styles.quickActionBtn} onClick={() => handleAction(a)} disabled={streaming}>
                {a}
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            placeholder="想改哪里？直接说…（Enter 发送 / Shift+Enter 换行）"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            ref={textareaRef}
            onKeyDown={(e) => {
              if (e.key === "Escape" && streaming) {
                e.preventDefault()
                abortRef.current?.abort()
                return
              }
              if (e.key !== "Enter") return
              if (e.shiftKey) return
              if ((e.nativeEvent as unknown as { isComposing?: boolean })?.isComposing) return
              e.preventDefault()
              send()
            }}
          />
          <button
            type="button"
            className={styles.sendBtn}
            disabled={!streaming && !canSend}
            onClick={() => {
              if (streaming) abortRef.current?.abort()
              else void send()
            }}
          >
            {streaming ? "停止" : "发送"}
          </button>
        </div>
        <div className={styles.helper}>{helperText}</div>
      </div>
    </div>
  )
}
