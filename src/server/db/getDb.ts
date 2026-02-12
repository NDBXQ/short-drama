import "server-only"

function normalizePgEnv(): void {
  const keys = ["PGDATABASE_URL", "DATABASE_URL", "POSTGRES_URL"] as const
  for (const key of keys) {
    const raw = process.env[key]
    if (!raw) continue

    const trimmed = raw.trim()
    if (!trimmed) continue

    try {
      const url = new URL(trimmed)

      const compat = (url.searchParams.get("uselibpqcompat") ?? "").toLowerCase()
      if (compat === "true") continue

      const sslmode = (url.searchParams.get("sslmode") ?? "").toLowerCase()
      if (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca") {
        url.searchParams.set("sslmode", "verify-full")
        process.env[key] = url.toString()
      }

      if (process.env.NODE_ENV !== "production") {
        const connectTimeout = (url.searchParams.get("connect_timeout") ?? "").trim()
        if (!connectTimeout) url.searchParams.set("connect_timeout", "3")

        const options = (url.searchParams.get("options") ?? "").trim()
        if (!options) url.searchParams.set("options", "-c statement_timeout=5000 -c lock_timeout=5000")

        process.env[key] = url.toString()
      }
    } catch {
    }
  }
}

export async function getDb(...args: Parameters<(typeof import("coze-coding-dev-sdk"))["getDb"]>): ReturnType<(typeof import("coze-coding-dev-sdk"))["getDb"]> {
  const hasDbUrl =
    Boolean(process.env.PGDATABASE_URL?.trim()) || Boolean(process.env.DATABASE_URL?.trim()) || Boolean(process.env.POSTGRES_URL?.trim())

  if (!hasDbUrl) {
    throw new Error("Database URL is missing. Set PGDATABASE_URL or DATABASE_URL or POSTGRES_URL in .env.local.")
  }

  normalizePgEnv()
  const sdk = await import("coze-coding-dev-sdk")
  return sdk.getDb(...args)
}
