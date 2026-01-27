export type PreviewEntry = { id?: string; name: string; url: string; thumbnailUrl?: string | null }

export type ActivePreviews = {
  role: PreviewEntry[]
  background: PreviewEntry[]
  item: PreviewEntry[]
}

const pickPreview = (list: PreviewEntry[], name: string) => {
  const key = name.trim()
  if (!key) return null
  const exact = list.find((p) => p.name === key)
  if (exact) return exact
  const include = list.find((p) => key.includes(p.name) || p.name.includes(key))
  if (include) return include
  if (list.length === 1) return list[0]
  return null
}

export function buildReferenceImages(params: {
  activePreviews?: ActivePreviews
  sceneText: string
  roles: string[]
  roleItems: string[]
}): Array<{ name: string; url: string }> {
  const { activePreviews, sceneText, roles, roleItems } = params
  const bgList = activePreviews?.background ?? []
  const roleList = activePreviews?.role ?? []
  const itemList = activePreviews?.item ?? []

  const out: Array<{ name: string; url: string }> = []

  const bgName = sceneText.trim()
  if (bgName) {
    const p = pickPreview(bgList, bgName)
    if (p?.url) out.push({ name: p.name, url: p.url })
  }

  for (const r of roles) {
    const p = pickPreview(roleList, r)
    if (p?.url) out.push({ name: p.name, url: p.url })
  }

  for (const it of roleItems) {
    const p = pickPreview(itemList, it)
    if (p?.url) out.push({ name: p.name, url: p.url })
  }

  const seen = new Set<string>()
  return out.filter((v) => {
    const k = `${v.name}::${v.url}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

