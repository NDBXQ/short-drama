import { Suspense, type ReactElement } from "react"
import { TelemetryTasksPage } from "@/features/admin/TelemetryTasksPage"

export default function AdminTelemetryRoute(): ReactElement {
  return (
    <Suspense fallback={null}>
      <TelemetryTasksPage />
    </Suspense>
  )
}

