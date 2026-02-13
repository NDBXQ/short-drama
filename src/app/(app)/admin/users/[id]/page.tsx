import { Suspense, type ReactElement } from "react"
import { notFound } from "next/navigation"
import { UserDetailPage } from "@/features/admin/users"

export default async function AdminUserDetailRoute({
  params
}: {
  params: { id: string } | Promise<{ id: string }>
}): Promise<ReactElement> {
  const resolved = await Promise.resolve(params)
  const id = (resolved.id ?? "").trim()
  if (!id) notFound()

  return (
    <Suspense fallback={null}>
      <UserDetailPage userId={id} />
    </Suspense>
  )
}

