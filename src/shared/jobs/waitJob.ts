import { sleepWithAbort } from "@/shared/sse"

export type JobStatus = "queued" | "running" | "done" | "error"

export type JobGetResponse =
  | {
      ok: true
      data: { jobId: string; type: string; status: JobStatus; snapshot: Record<string, unknown> }
    }
  | { ok: false; error?: { message?: string } }

export async function waitJobDone(params: {
  jobId: string
  timeoutMs?: number
  minIntervalMs?: number
  maxIntervalMs?: number
  signal?: AbortSignal
  traceId?: string
}): Promise<{ jobId: string; type: string; status: JobStatus; snapshot: Record<string, unknown> }> {
  const timeoutMs = params.timeoutMs ?? 8 * 60_000
  const minIntervalMs = params.minIntervalMs ?? 400
  const maxIntervalMs = params.maxIntervalMs ?? 2000
  const start = Date.now()
  let interval = minIntervalMs

  while (true) {
    if (params.signal?.aborted) throw new Error("aborted")
    if (Date.now() - start > timeoutMs) throw new Error("job_timeout")

    const res = await fetch(`/api/jobs/${encodeURIComponent(params.jobId)}`, {
      cache: "no-store",
      headers: params.traceId ? { "x-trace-id": params.traceId } : undefined
    })
    const json = (await res.json().catch(() => null)) as JobGetResponse | null
    if (!res.ok || !json || json.ok !== true) {
      await sleepWithAbort(interval, params.signal)
      interval = Math.min(maxIntervalMs, Math.round(interval * 1.35))
      continue
    }

    const { jobId, type, status, snapshot } = json.data
    if (status === "done" || status === "error") return { jobId, type, status, snapshot }

    await sleepWithAbort(interval, params.signal)
    interval = Math.min(maxIntervalMs, Math.round(interval * 1.2))
  }
}

