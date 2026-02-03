export type NavItem = {
  href: string
  label: string
}

export const appNavItems: NavItem[] = [
  { href: "/", label: "首页" },
  { href: "/script/workspace?entry=nav", label: "剧本创作" },
  { href: "/video", label: "视频创作" },
  { href: "/library", label: "内容库" }
]

export const libraryNavItems: NavItem[] = []
