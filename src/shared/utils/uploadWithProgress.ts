export type UploadProgress = {
  loaded: number
  total: number
  percent: number | null
}

export function postFormDataWithProgress<T = unknown>(input: {
  url: string
  formData: FormData
  withCredentials?: boolean
  onProgress?: (p: UploadProgress) => void
}): { promise: Promise<{ status: number; json: T | null; text: string }>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const withCredentials = input.withCredentials ?? true

  const promise = new Promise<{ status: number; json: T | null; text: string }>((resolve, reject) => {
    xhr.open("POST", input.url, true)
    xhr.withCredentials = withCredentials

    xhr.upload.onprogress = (e) => {
      const total = typeof e.total === "number" ? e.total : 0
      const loaded = typeof e.loaded === "number" ? e.loaded : 0
      const percent = e.lengthComputable && total > 0 ? Math.round((loaded / total) * 100) : null
      input.onProgress?.({ loaded, total, percent })
    }

    xhr.onload = () => {
      const status = xhr.status
      const text = typeof xhr.responseText === "string" ? xhr.responseText : ""
      let json: T | null = null
      try {
        json = text ? (JSON.parse(text) as T) : null
      } catch {
        json = null
      }
      resolve({ status, json, text })
    }

    xhr.onerror = () => reject(new Error("网络错误"))
    xhr.onabort = () => reject(new Error("上传已取消"))

    xhr.send(input.formData)
  })

  return { promise, abort: () => xhr.abort() }
}

export function putBlobWithProgress<T = unknown>(input: {
  url: string
  blob: Blob
  withCredentials?: boolean
  onProgress?: (p: UploadProgress) => void
}): { promise: Promise<{ status: number; json: T | null; text: string }>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const withCredentials = input.withCredentials ?? true

  const promise = new Promise<{ status: number; json: T | null; text: string }>((resolve, reject) => {
    xhr.open("PUT", input.url, true)
    xhr.withCredentials = withCredentials

    xhr.upload.onprogress = (e) => {
      const total = typeof e.total === "number" ? e.total : 0
      const loaded = typeof e.loaded === "number" ? e.loaded : 0
      const percent = e.lengthComputable && total > 0 ? Math.round((loaded / total) * 100) : null
      input.onProgress?.({ loaded, total, percent })
    }

    xhr.onload = () => {
      const status = xhr.status
      const text = typeof xhr.responseText === "string" ? xhr.responseText : ""
      let json: T | null = null
      try {
        json = text ? (JSON.parse(text) as T) : null
      } catch {
        json = null
      }
      resolve({ status, json, text })
    }

    xhr.onerror = () => reject(new Error("网络错误"))
    xhr.onabort = () => reject(new Error("上传已取消"))

    xhr.send(input.blob)
  })

  return { promise, abort: () => xhr.abort() }
}
