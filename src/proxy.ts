import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSessionFromRequest } from "@/shared/session"

const protectedPrefixes = ["/", "/script", "/video", "/library", "/help", "/admin"]
const adminAccount = (process.env.ADMIN_ACCOUNT ?? "admin").trim()
const adminPanelEnabled = process.env.ADMIN_PANEL_ENABLED === "1" || process.env.NODE_ENV !== "production"

function parseIpList(value: string | undefined): string[] {
  const raw = (value ?? "").trim()
  if (!raw) return []
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (items.includes("*")) return ["*"]
  return items
}

function getRequestIp(req: NextRequest): string {
  const xff = (req.headers.get("x-forwarded-for") ?? "").trim()
  if (xff) return xff.split(",")[0]!.trim()
  const xri = (req.headers.get("x-real-ip") ?? "").trim()
  if (xri) return xri
  return (req as any).ip ?? ""
}

function allowAdminIp(req: NextRequest): boolean {
  const allowlist = parseIpList(process.env.ADMIN_IP_ALLOWLIST)
  if (allowlist.length === 0) return true
  if (allowlist[0] === "*") return true
  const ip = getRequestIp(req)
  if (!ip) return false
  return allowlist.includes(ip)
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return true
  if (pathname.startsWith("/admin")) return true
  return protectedPrefixes.some((p) => p !== "/" && pathname.startsWith(p))
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (pathname.startsWith("/api")) return NextResponse.next()
  if (pathname.startsWith("/_next")) return NextResponse.next()
  if (pathname === "/favicon.ico") return NextResponse.next()

  const session = await getSessionFromRequest(req)

  if (pathname.startsWith("/admin") && !adminPanelEnabled) {
    const url = req.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith("/admin") && !allowAdminIp(req)) {
    const url = req.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (pathname === "/login") {
    return NextResponse.next()
  }

  if (!isProtectedPath(pathname)) return NextResponse.next()

  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", `${pathname}${req.nextUrl.search ?? ""}`)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith("/admin") && session.account !== adminAccount) {
    const url = req.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
}
