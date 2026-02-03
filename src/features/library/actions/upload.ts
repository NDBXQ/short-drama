"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { getDb } from "coze-coding-dev-sdk"
import { publicResources, insertPublicResourceSchema } from "@/shared/schema"
import { uploadPublicFile } from "@/shared/storage"
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/shared/session"
import { getTraceId } from "@/shared/trace"

export async function uploadPublicResource(formData: FormData) {
  try {
    const traceId = getTraceId(new Headers())
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
    if (!token) return { success: false, message: "未登录或登录已过期" }
    const session = await verifySessionToken(token, traceId)
    if (!session?.userId) return { success: false, message: "未登录或登录已过期" }

    const file = formData.get("file") as File
    const type = formData.get("type") as string
    const name = formData.get("name") as string
    const description = formData.get("description") as string
    const tagsStr = formData.get("tags") as string
    const scenesStr = formData.get("applicableScenes") as string

    if (!file) throw new Error("No file provided")

    // Upload to S3
    const { url, key } = await uploadPublicFile(file, `public/${type}`)

    // Parse metadata
    const tags = tagsStr ? tagsStr.split(",").map(t => t.trim()).filter(Boolean) : []
    const applicableScenes = scenesStr ? scenesStr.split(",").map(t => t.trim()).filter(Boolean) : []
    const resourceName = name || file.name.split(".")[0]

    // Validate payload
    const payload = insertPublicResourceSchema.parse({
      userId: session.userId,
      type,
      source: "upload",
      name: resourceName,
      description: description || "",
      previewUrl: url,
      previewStorageKey: key,
      originalUrl: url,
      originalStorageKey: key,
      tags,
      applicableScenes
    })

    // Insert to DB
    const db = await getDb({ publicResources })
    await db.insert(publicResources).values(payload)

    revalidatePath("/library")
    
    return { success: true }
  } catch (error) {
    console.error("Failed to upload public resource:", error)
    return { 
      success: false, 
      message: error instanceof Error ? error.message : "Upload failed" 
    }
  }
}
