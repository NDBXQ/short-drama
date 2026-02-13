import { NextResponse, type NextRequest } from "next/server"
import { makeApiOk } from "@/shared/api"
import { getTraceId } from "@/shared/trace"
import { logger } from "@/shared/logger"
import { requireAdmin } from "@/server/domains/admin/services/adminGuard"
import fs from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"

const METHOD_RE = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*\(/g

async function listRouteFiles(apiRoot: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(full)
        continue
      }
      if (ent.isFile() && ent.name === "route.ts") out.push(full)
    }
  }
  await walk(apiRoot)
  return out
}

function routeFromFile(apiRoot: string, filePath: string): { route: string; file: string } {
  const rel = path.relative(apiRoot, filePath)
  const dir = path.dirname(rel)
  const routePath = dir === "." ? "/api" : `/api/${dir.split(path.sep).join("/")}`
  return { route: routePath, file: `src/app/api/${rel.split(path.sep).join("/")}` }
}

function methodsFromSource(src: string): string[] {
  const methods = new Set<string>()
  for (const match of src.matchAll(METHOD_RE)) {
    const m = match[1]
    if (m) methods.add(m)
  }
  return Array.from(methods).sort()
}

export async function GET(req: NextRequest): Promise<Response> {
  const traceId = getTraceId(req.headers)
  const admin = await requireAdmin(req, traceId)
  if (admin instanceof Response) return admin

  const rootCandidates = [path.join(process.cwd(), "src", "app", "api"), path.join(process.cwd(), "app", "api")]
  const apiRoot = await (async () => {
    for (const p of rootCandidates) {
      try {
        const st = await fs.stat(p)
        if (st.isDirectory()) return p
      } catch {}
    }
    return ""
  })()

  if (!apiRoot) {
    return NextResponse.json(makeApiOk(traceId, { items: [], source: "unavailable" }), { status: 200 })
  }

  const start = Date.now()
  try {
    const files = await listRouteFiles(apiRoot)
    const items: Array<{ route: string; methods: string[]; file: string }> = []
    for (const f of files) {
      const src = await fs.readFile(f, "utf8")
      const { route, file } = routeFromFile(apiRoot, f)
      const methods = methodsFromSource(src)
      items.push({ route, methods, file })
    }
    items.sort((a, b) => a.route.localeCompare(b.route))

    logger.info({
      event: "admin_routes_scanned",
      module: "admin",
      traceId,
      message: "扫描 API routes 完成",
      count: items.length,
      durationMs: Date.now() - start
    })

    return NextResponse.json(makeApiOk(traceId, { items, source: "fs" }), { status: 200 })
  } catch (e) {
    const anyErr = e as { name?: string; message?: string; stack?: string }
    logger.error({
      event: "admin_routes_scan_failed",
      module: "admin",
      traceId,
      message: "扫描 API routes 失败",
      errorName: anyErr?.name,
      errorMessage: anyErr?.message,
      stack: anyErr?.stack
    })
    return NextResponse.json(makeApiOk(traceId, { items: [], source: "error" }), { status: 200 })
  }
}
