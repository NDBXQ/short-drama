import { Suspense, type ReactElement } from "react"
import { AuditLogsPage } from "@/features/admin/audit"

export default function AdminAuditRoute(): ReactElement {
  return (
    <Suspense fallback={null}>
      <AuditLogsPage />
    </Suspense>
  )
}

