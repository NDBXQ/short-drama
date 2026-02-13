type LogLevel = "debug" | "info" | "warn" | "error"

type LogPayload = Record<string, unknown> & {
  event: string
  module: string
  traceId: string
  message: string
}

let fileWriteChain: Promise<void> | null = null

function resolveErrorLogFilePath(): string | null {
  if (typeof window !== "undefined") return null
  const envPath = typeof process !== "undefined" ? process.env.LOG_ERROR_FILE : undefined
  if (typeof envPath === "string" && envPath.trim()) return envPath.trim()
  const nodeEnv = typeof process !== "undefined" ? process.env.NODE_ENV : undefined
  if (nodeEnv === "development") return ".next/dev/logs/next-development.log"
  return ".next/logs/app-error.log"
}

function shouldWriteErrorLogsToFile(): boolean {
  if (typeof window !== "undefined") return false
  const flag = typeof process !== "undefined" ? process.env.LOG_ERROR_TO_FILE : undefined
  if (flag === "true") return true
  if (flag === "false") return false
  const nodeEnv = typeof process !== "undefined" ? process.env.NODE_ENV : undefined
  return nodeEnv === "development"
}

function enqueueErrorLogWrite(line: string): void {
  const filePath = resolveErrorLogFilePath()
  if (!filePath) return
  if (!shouldWriteErrorLogsToFile()) return

  const run = async () => {
    const [{ mkdir, appendFile }, path] = await Promise.all([import("node:fs/promises"), import("node:path")])
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await appendFile(absolute, line, { encoding: "utf8" })
  }

  if (!fileWriteChain) fileWriteChain = Promise.resolve()
  fileWriteChain = fileWriteChain.then(run, run).catch(() => undefined)
}

/**
 * 输出结构化日志
 * @param {LogLevel} level - 日志级别
 * @param {LogPayload} payload - 日志负载
 * @returns {void} 无返回值
 */
function log(level: LogLevel, payload: LogPayload): void {
  const record = {
    level,
    timestamp: new Date().toISOString(),
    ...payload
  }
  const headline = `${payload.module}:${payload.event} ${payload.message}`
  const serialized = (() => {
    try {
      return JSON.stringify(record)
    } catch {
      return "{}"
    }
  })()
  if (level === "error") {
    try {
      enqueueErrorLogWrite(`${headline} ${serialized}\n`)
    } catch {}
  }

  if (level === "error") {
    console.error(`${headline} ${serialized}`)
    return
  }

  if (level === "warn") {
    console.warn(headline, record)
    return
  }

  if (level === "info") {
    console.info(headline, record)
    return
  }

  console.debug(headline, record)
}

export const logger = {
  /**
   * 输出 debug 日志
   * @param {LogPayload} payload - 日志负载
   * @returns {void} 无返回值
   */
  debug(payload: LogPayload): void {
    log("debug", payload)
  },
  /**
   * 输出 info 日志
   * @param {LogPayload} payload - 日志负载
   * @returns {void} 无返回值
   */
  info(payload: LogPayload): void {
    log("info", payload)
  },
  /**
   * 输出 warn 日志
   * @param {LogPayload} payload - 日志负载
   * @returns {void} 无返回值
   */
  warn(payload: LogPayload): void {
    log("warn", payload)
  },
  /**
   * 输出 error 日志
   * @param {LogPayload} payload - 日志负载
   * @returns {void} 无返回值
   */
  error(payload: LogPayload): void {
    log("error", payload)
  }
}
