const lockIsFresh = (startedAt: number, ttlMs: number) => Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < ttlMs

export function readClientLock(key: string, ttlMs: number): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { startedAt?: number }
    const startedAt = Number(parsed?.startedAt ?? 0)
    if (!lockIsFresh(startedAt, ttlMs)) {
      window.localStorage.removeItem(key)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function writeClientLock(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify({ startedAt: Date.now() }))
  } catch {}
}

export function clearClientLock(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

