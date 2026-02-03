import { readFile } from "node:fs/promises"
import path from "node:path"
import { ServiceError } from "@/server/services/errors"

function getCache(): Map<string, string> {
  const g = globalThis as any
  if (!g.__vibe_skill_cache) g.__vibe_skill_cache = new Map<string, string>()
  return g.__vibe_skill_cache as Map<string, string>
}

export async function loadSkillInstructions(skillName: string): Promise<string> {
  const name = (skillName ?? "").trim()
  if (!name) throw new ServiceError("SKILL_NOT_FOUND", "Skill 名称为空")
  const cache = getCache()
  const cached = cache.get(name)
  if (cached) return cached

  const filePath = path.join(process.cwd(), "src", "server", "services", "vibeCreating", "skills", name, "SKILL.md")
  const raw = await readFile(filePath, "utf8").catch(() => null)
  if (!raw) throw new ServiceError("SKILL_NOT_FOUND", `Skill 不存在：${name}`)
  const trimmed = raw.trim()
  cache.set(name, trimmed)
  return trimmed
}
