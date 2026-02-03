import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ApiRouteItem, BodyKind, FormField, KeyValuePair, RequestDraft, ResponseState, SavedRequest } from "./types"
import { buildCurl, shouldDefaultContentType } from "./curl"
import { loadHistory, saveHistory } from "./storage"

const newId = () => `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
const emptyPair = (): KeyValuePair => ({ id: newId(), key: "", value: "" })
const emptyFormField = (type: "text" | "file"): FormField => ({ id: newId(), name: "", type, value: "", file: null })

const toSavedRequest = (draft: RequestDraft): SavedRequest => ({
  ...draft,
  formFields: draft.formFields.map((f) => ({ ...f, file: null }))
})

const fromSavedRequest = (saved: SavedRequest): RequestDraft => ({
  ...saved,
  formFields: saved.formFields.map((f) => ({ ...f, file: null }))
})

function normalizeHeadersForSend(bodyKind: BodyKind, pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) {
    const k = (p.key ?? "").trim()
    const v = (p.value ?? "").trim()
    if (!k) continue
    out[k] = v
  }
  const defaultCt = shouldDefaultContentType(bodyKind)
  if (defaultCt && !Object.keys(out).some((k) => k.toLowerCase() === "content-type")) out["Content-Type"] = defaultCt
  return out
}

function parseResponseHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    out[k] = v
  })
  return out
}

function tryParseJson(text: string): unknown | null {
  const t = text.trim()
  if (!t) return null
  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

export function useApiTester(routes: ApiRouteItem[]): {
  filter: string
  setFilter: (v: string) => void
  activeRoute: ApiRouteItem | null
  setActiveRoute: (r: ApiRouteItem) => void
  history: SavedRequest[]
  historyOpen: boolean
  setHistoryOpen: (v: boolean) => void
  draft: RequestDraft
  setDraft: React.Dispatch<React.SetStateAction<RequestDraft>>
  resp: ResponseState
  updateHeader: (id: string, patch: Partial<KeyValuePair>) => void
  addHeader: () => void
  removeHeader: (id: string) => void
  updateField: (id: string, patch: Partial<FormField>) => void
  addField: (type: "text" | "file") => void
  removeField: (id: string) => void
  sendRequest: () => Promise<void>
  stopStream: () => void
  pickHistory: (item: SavedRequest) => void
  copyCurl: () => Promise<void>
  clearResponse: () => void
} {
  const [filter, setFilter] = useState("")
  const [activeRoute, setActiveRouteState] = useState<ApiRouteItem | null>(null)

  const [history, setHistory] = useState<SavedRequest[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

  const [draft, setDraft] = useState<RequestDraft>(() => ({
    id: newId(),
    title: "未命名请求",
    method: "GET",
    url: "/api/auth/me",
    headers: [emptyPair()],
    bodyKind: "none",
    bodyText: "",
    formFields: [emptyFormField("text")],
    stream: false
  }))

  const [resp, setResp] = useState<ResponseState>({
    running: false,
    status: null,
    timeMs: null,
    headers: {},
    bodyText: "",
    bodyJson: null,
    error: null,
    streamEvents: []
  })

  const streamRef = useRef<EventSource | null>(null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (routes.length === 0) return
    if (activeRoute) return
    const first = routes.find((r) => r.route.startsWith("/api/auth/me")) ?? routes[0]!
    setActiveRouteState(first)
  }, [activeRoute, routes])

  useEffect(() => {
    if (!activeRoute) return
    setDraft((prev) => {
      const method = activeRoute.methods[0] ?? "GET"
      const nextUrl = activeRoute.route
      const title = `${method} ${nextUrl}`
      return { ...prev, id: newId(), title, method, url: nextUrl, stream: nextUrl.includes("/events") && method === "GET" }
    })
    setResp((r) => ({ ...r, bodyText: "", bodyJson: null, error: null, status: null, timeMs: null, headers: {}, streamEvents: [] }))
  }, [activeRoute])

  const setActiveRoute = useCallback((r: ApiRouteItem) => setActiveRouteState(r), [])

  const updateHeader = useCallback((id: string, patch: Partial<KeyValuePair>) => {
    setDraft((d) => ({ ...d, headers: d.headers.map((h) => (h.id === id ? { ...h, ...patch } : h)) }))
  }, [])

  const addHeader = useCallback(() => setDraft((d) => ({ ...d, headers: [...d.headers, emptyPair()] })), [])

  const removeHeader = useCallback((id: string) => {
    setDraft((d) => ({ ...d, headers: d.headers.length <= 1 ? d.headers : d.headers.filter((h) => h.id !== id) }))
  }, [])

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setDraft((d) => ({ ...d, formFields: d.formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  }, [])

  const addField = useCallback((type: "text" | "file") => setDraft((d) => ({ ...d, formFields: [...d.formFields, emptyFormField(type)] })), [])

  const removeField = useCallback((id: string) => {
    setDraft((d) => ({ ...d, formFields: d.formFields.length <= 1 ? d.formFields : d.formFields.filter((f) => f.id !== id) }))
  }, [])

  const stopStream = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
    setResp((r) => ({ ...r, running: false }))
  }, [])

  const pushHistory = useCallback((req: RequestDraft) => {
    setHistory((prev) => {
      const saved = toSavedRequest(req)
      const next = [saved, ...prev.filter((p) => p.url !== saved.url || p.method !== saved.method || p.bodyText !== saved.bodyText)].slice(0, 40)
      saveHistory(next)
      return next
    })
  }, [])

  const sendRequest = useCallback(async () => {
    if (resp.running) return
    stopStream()
    setResp({ running: true, status: null, timeMs: null, headers: {}, bodyText: "", bodyJson: null, error: null, streamEvents: [] })

    const start = performance.now()
    try {
      pushHistory(draft)
      const method = (draft.method ?? "GET").toUpperCase()
      const url = (draft.url ?? "").trim()
      if (!url) throw new Error("URL 不能为空")

      if (draft.stream) {
        if (method !== "GET") throw new Error("流式模式仅支持 GET")
        const events: string[] = []
        const es = new EventSource(url)
        streamRef.current = es
        es.onmessage = (ev) => {
          events.push(ev.data)
          setResp((r) => ({ ...r, streamEvents: [...events], running: true, timeMs: Math.round(performance.now() - start) }))
        }
        es.onerror = () => {
          es.close()
          if (streamRef.current === es) streamRef.current = null
          setResp((r) => ({ ...r, running: false, error: r.error ?? "流式连接已断开", timeMs: Math.round(performance.now() - start) }))
        }
        return
      }

      const headers = normalizeHeadersForSend(draft.bodyKind, draft.headers)
      const init: RequestInit = { method, headers }

      if (draft.bodyKind === "json" || draft.bodyKind === "text") {
        const body = (draft.bodyText ?? "").trim()
        if (body) init.body = body
      }

      if (draft.bodyKind === "form") {
        const form = new FormData()
        for (const f of draft.formFields) {
          const name = (f.name ?? "").trim()
          if (!name) continue
          if (f.type === "file") {
            if (f.file) form.set(name, f.file)
            continue
          }
          form.set(name, f.value ?? "")
        }
        init.body = form
        delete (init.headers as any)["Content-Type"]
        for (const k of Object.keys(init.headers as any)) {
          if (k.toLowerCase() === "content-type") delete (init.headers as any)[k]
        }
      }

      const res = await fetch(url, init)
      const bodyText = await res.text()
      const headersOut = parseResponseHeaders(res)
      const ct = (headersOut["content-type"] ?? headersOut["Content-Type"] ?? "").toLowerCase()
      const bodyJson = ct.includes("application/json") ? tryParseJson(bodyText) : null

      setResp({
        running: false,
        status: res.status,
        timeMs: Math.round(performance.now() - start),
        headers: headersOut,
        bodyText,
        bodyJson,
        error: null,
        streamEvents: []
      })
    } catch (e) {
      const anyErr = e as { message?: string }
      setResp({
        running: false,
        status: null,
        timeMs: Math.round(performance.now() - start),
        headers: {},
        bodyText: "",
        bodyJson: null,
        error: anyErr?.message ?? "请求失败",
        streamEvents: []
      })
    }
  }, [draft, pushHistory, resp.running, stopStream])

  const pickHistory = useCallback(
    (item: SavedRequest) => {
      stopStream()
      setDraft(fromSavedRequest(item))
      setHistoryOpen(false)
    },
    [stopStream]
  )

  const copyCurl = useCallback(async () => {
    const text = buildCurl(draft)
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }, [draft])

  const clearResponse = useCallback(() => {
    stopStream()
    setResp((r) => ({ ...r, running: false, status: null, timeMs: null, headers: {}, bodyText: "", bodyJson: null, error: null, streamEvents: [] }))
  }, [stopStream])

  return useMemo(
    () => ({
      filter,
      setFilter,
      activeRoute,
      setActiveRoute,
      history,
      historyOpen,
      setHistoryOpen,
      draft,
      setDraft,
      resp,
      updateHeader,
      addHeader,
      removeHeader,
      updateField,
      addField,
      removeField,
      sendRequest,
      stopStream,
      pickHistory,
      copyCurl,
      clearResponse
    }),
    [
      activeRoute,
      addField,
      addHeader,
      clearResponse,
      copyCurl,
      draft,
      filter,
      history,
      historyOpen,
      pickHistory,
      removeField,
      removeHeader,
      resp,
      sendRequest,
      setActiveRoute,
      stopStream,
      updateField,
      updateHeader
    ]
  )
}

