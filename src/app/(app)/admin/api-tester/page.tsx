import { Suspense, type ReactElement } from "react"
import { ApiTesterPage } from "@/features/admin/ApiTesterPage"

export default function AdminApiTesterRoute(): ReactElement {
  return (
    <Suspense fallback={null}>
      <ApiTesterPage />
    </Suspense>
  )
}

