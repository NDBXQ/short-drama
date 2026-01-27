import { useMemo } from "react"
import type { StoryboardItem } from "@/features/video/types"

export function useWorkspaceDialogues(activeItem: StoryboardItem | null): Array<{ id: string; roleName: string; content: string }> {
  return useMemo(() => {
    const roles = activeItem?.scriptContent?.shot_content?.roles
    const list = Array.isArray(roles) ? roles : []
    return list
      .map((r, idx) => {
        const roleName = typeof r?.role_name === "string" ? r.role_name.trim() : ""
        const content = typeof r?.speak?.content === "string" ? r.speak.content.trim() : ""
        if (!content) return null
        const id = `${activeItem?.id ?? "no"}:${idx}:${roleName || "role"}`
        return { id, roleName: roleName || "旁白", content }
      })
      .filter(Boolean) as Array<{ id: string; roleName: string; content: string }>
  }, [activeItem])
}

