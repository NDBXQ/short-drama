import { logger } from "@/shared/logger"
import { ensurePublicSchema } from "@/server/db/ensurePublicSchema"
import { ensureTvcSchema } from "@/server/db/ensureTvcSchema"

const ENSURE_VERSION = 1

export async function ensureAppSchema(): Promise<void> {
  const g = globalThis as any
  if (g.__appSchemaEnsuredVersion === ENSURE_VERSION) return
  if (g.__appSchemaEnsuring) return g.__appSchemaEnsuring as Promise<void>

  g.__appSchemaEnsuring = (async () => {
    const start = performance.now()
    try {
      await ensurePublicSchema()
      await ensureTvcSchema()
      const durationMs = Math.round(performance.now() - start)
      logger.info({ event: "db_schema_ready", module: "db", traceId: "startup", message: "数据库 schema 已就绪", durationMs })
      g.__appSchemaEnsuredVersion = ENSURE_VERSION
    } catch (e) {
      const durationMs = Math.round(performance.now() - start)
      const anyErr = e as { name?: string; message?: string; stack?: string; code?: string }
      logger.warn({
        event: "db_schema_ensure_failed",
        module: "db",
        traceId: "startup",
        message: "数据库 schema 初始化失败，将继续启动（功能可能受限）",
        durationMs,
        errorName: anyErr?.name,
        errorMessage: anyErr?.message,
        stack: anyErr?.stack,
        code: anyErr?.code
      })
    }
  })()

  try {
    await g.__appSchemaEnsuring
  } finally {
    g.__appSchemaEnsuring = null
  }
}

