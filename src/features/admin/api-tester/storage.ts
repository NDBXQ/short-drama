import type { SavedRequest } from "./types"

const HISTORY_KEY = "admin_api_tester_history_v1"
const MAX_ITEMS = 40

export function loadHistory(): SavedRequest[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((v) => (v && typeof v === "object" ? (v as SavedRequest) : null))
      .filter(Boolean) as SavedRequest[]
  } catch {
    return []
  }
}

export function saveHistory(next: SavedRequest[]): void {
  if (typeof window === "undefined") return
  try {
    const trimmed = next.slice(0, MAX_ITEMS)
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch {}
}

