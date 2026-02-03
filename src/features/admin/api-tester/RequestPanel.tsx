import type { ReactElement } from "react"
import styles from "./ApiTesterPage.module.css"
import type { BodyKind, FormField, KeyValuePair, RequestDraft } from "./types"

export function RequestPanel({
  draft,
  setDraft,
  running,
  onSend,
  onStop,
  onCopyCurl,
  onClearResponse,
  updateHeader,
  addHeader,
  removeHeader,
  updateField,
  addField,
  removeField
}: {
  draft: RequestDraft
  setDraft: React.Dispatch<React.SetStateAction<RequestDraft>>
  running: boolean
  onSend: () => void
  onStop: () => void
  onCopyCurl: () => void
  onClearResponse: () => void
  updateHeader: (id: string, patch: Partial<KeyValuePair>) => void
  addHeader: () => void
  removeHeader: (id: string) => void
  updateField: (id: string, patch: Partial<FormField>) => void
  addField: (type: "text" | "file") => void
  removeField: (id: string) => void
}): ReactElement {
  return (
    <section className={styles.panel} aria-label="请求编辑器">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitle}>请求</div>
        <div className={styles.panelHeaderActions}>
          <button type="button" className={styles.panelBtn} onClick={onCopyCurl}>
            复制 curl
          </button>
          <button type="button" className={styles.panelBtn} onClick={onClearResponse} disabled={running}>
            清空响应
          </button>
        </div>
      </div>

      <div className={styles.form}>
        <div className={styles.row}>
          <select
            className={styles.select}
            value={draft.method}
            onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value.toUpperCase(), title: `${e.target.value.toUpperCase()} ${(d.url ?? "").trim()}` }))}
            aria-label="请求方法"
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input className={styles.url} value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value, title: `${(d.method ?? "GET").toUpperCase()} ${e.target.value}` }))} aria-label="请求 URL" />
        </div>

        <div className={styles.inlineRow}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={draft.stream}
              onChange={(e) => setDraft((d) => ({ ...d, stream: e.target.checked }))}
              disabled={draft.method.toUpperCase() !== "GET"}
            />
            流式模式（EventSource）
          </label>
          <button type="button" className={styles.sendBtn} disabled={running} onClick={onSend}>
            {running ? "请求中…" : "发送"}
          </button>
          {draft.stream && running ? (
            <button type="button" className={styles.stopBtn} onClick={onStop}>
              停止
            </button>
          ) : null}
        </div>

        <div className={styles.block}>
          <div className={styles.blockTitle}>Headers</div>
          <div className={styles.kvTable}>
            {draft.headers.map((h) => (
              <div key={h.id} className={styles.kvRow}>
                <input className={styles.kvKey} value={h.key} onChange={(e) => updateHeader(h.id, { key: e.target.value })} placeholder="Header" aria-label="Header 名" />
                <input className={styles.kvVal} value={h.value} onChange={(e) => updateHeader(h.id, { value: e.target.value })} placeholder="Value" aria-label="Header 值" />
                <button type="button" className={styles.kvDel} onClick={() => removeHeader(h.id)} aria-label="删除 Header">
                  ×
                </button>
              </div>
            ))}
            <button type="button" className={styles.kvAdd} onClick={addHeader}>
              + 添加 Header
            </button>
          </div>
        </div>

        <div className={styles.block}>
          <div className={styles.blockTitle}>Body</div>
          <div className={styles.bodyTabs} role="tablist" aria-label="Body 类型">
            {(["none", "json", "text", "form"] as BodyKind[]).map((k) => (
              <button
                type="button"
                key={k}
                role="tab"
                aria-selected={draft.bodyKind === k}
                className={`${styles.bodyTab} ${draft.bodyKind === k ? styles.bodyTabActive : ""}`}
                onClick={() => setDraft((d) => ({ ...d, bodyKind: k, bodyText: k === "none" || k === "form" ? "" : d.bodyText }))}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>

          {draft.bodyKind === "json" || draft.bodyKind === "text" ? (
            <textarea
              className={styles.textarea}
              value={draft.bodyText}
              onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
              placeholder={draft.bodyKind === "json" ? '{ \"key\": \"value\" }' : "plain text"}
              aria-label="请求 Body"
            />
          ) : null}

          {draft.bodyKind === "form" ? (
            <div className={styles.formFields}>
              {draft.formFields.map((f) => (
                <div key={f.id} className={styles.formField}>
                  <select
                    className={styles.selectSmall}
                    value={f.type}
                    onChange={(e) => updateField(f.id, { type: e.target.value as any, value: "", file: null })}
                    aria-label="字段类型"
                  >
                    <option value="text">text</option>
                    <option value="file">file</option>
                  </select>
                  <input className={styles.kvKey} value={f.name} onChange={(e) => updateField(f.id, { name: e.target.value })} placeholder="name" aria-label="字段名" />
                  {f.type === "file" ? (
                    <input
                      type="file"
                      className={styles.file}
                      onChange={(e) => updateField(f.id, { file: e.target.files?.[0] ?? null, value: e.target.files?.[0]?.name ?? "" })}
                      aria-label="选择文件"
                    />
                  ) : (
                    <input className={styles.kvVal} value={f.value} onChange={(e) => updateField(f.id, { value: e.target.value })} placeholder="value" aria-label="字段值" />
                  )}
                  <button type="button" className={styles.kvDel} onClick={() => removeField(f.id)} aria-label="删除字段">
                    ×
                  </button>
                </div>
              ))}
              <div className={styles.formFieldActions}>
                <button type="button" className={styles.kvAdd} onClick={() => addField("text")}>
                  + text
                </button>
                <button type="button" className={styles.kvAdd} onClick={() => addField("file")}>
                  + file
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

