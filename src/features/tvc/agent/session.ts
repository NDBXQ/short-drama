export function getOrCreateTvcSessionId(projectId?: string | null): string {
  const suffix = (projectId ?? "").trim() || "global"
  const key = `tvc_agent_session_id:${suffix}`
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
  if (existing && existing.trim()) return existing.trim()
  const id = crypto.randomUUID()
  try {
    window.localStorage.setItem(key, id)
  } catch {}
  return id
}

