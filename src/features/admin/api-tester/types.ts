export type ApiRouteItem = { route: string; methods: string[]; file: string }

export type KeyValuePair = { id: string; key: string; value: string }

export type BodyKind = "none" | "json" | "text" | "form"

export type FormField = { id: string; name: string; type: "text" | "file"; value: string; file: File | null }

export type RequestDraft = {
  id: string
  title: string
  method: string
  url: string
  headers: KeyValuePair[]
  bodyKind: BodyKind
  bodyText: string
  formFields: FormField[]
  stream: boolean
}

export type SavedRequest = Omit<RequestDraft, "formFields"> & {
  formFields: Array<Omit<FormField, "file"> & { file: null }>
}

export type ResponseState = {
  running: boolean
  status: number | null
  timeMs: number | null
  headers: Record<string, string>
  bodyText: string
  bodyJson: unknown | null
  error: string | null
  streamEvents: string[]
}

