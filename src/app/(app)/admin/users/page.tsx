import { Suspense, type ReactElement } from "react"
import { UsersPage } from "@/features/admin/users"

export default function AdminUsersRoute(): ReactElement {
  return (
    <Suspense fallback={null}>
      <UsersPage />
    </Suspense>
  )
}

