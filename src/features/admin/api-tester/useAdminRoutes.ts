import { useSyncExternalStore } from "react"
import type { ApiRouteItem } from "./types"

type AdminRoutesResult =
  | { ok: true; data: { items: ApiRouteItem[]; source: string }; traceId: string }
  | { ok: false; error: { code: string; message: string }; traceId: string }

type StoreState = { loading: boolean; error: string | null; items: ApiRouteItem[]; source: string }

let storeState: StoreState = { loading: true, error: null, items: [], source: "" }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function emit(): void {
  listeners.forEach((fn) => fn())
}

async function fetchRoutes(markLoading: boolean): Promise<void> {
  if (markLoading) {
    storeState = { ...storeState, loading: true, error: null }
    emit()
  }

  try {
    const res = await fetch("/api/admin/routes", { method: "GET" })
    const json = (await res.json()) as AdminRoutesResult
    if (!json.ok) {
      storeState = { loading: false, error: json.error.message, items: [], source: "" }
      emit()
      return
    }
    storeState = { loading: false, error: null, items: json.data.items ?? [], source: json.data.source ?? "" }
    emit()
  } catch {
    storeState = { loading: false, error: "网络错误", items: [], source: "" }
    emit()
  }
}

function ensureLoaded(): void {
  if (typeof window === "undefined") return
  if (inflight) return
  inflight = fetchRoutes(false).finally(() => {
    inflight = null
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): StoreState {
  return storeState
}

export function useAdminRoutes(): {
  loading: boolean
  error: string | null
  items: ApiRouteItem[]
  source: string
  refresh: () => void
} {
  ensureLoaded()
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { loading: state.loading, error: state.error, items: state.items, source: state.source, refresh: () => void fetchRoutes(true) }
}
