"use client"

import { useEffect } from "react"

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {}, [props.error])

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>页面加载失败</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.62)" }}>
        {props.error?.message || "未知错误"}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.62)" }}>
        这通常是数据库连接不可达导致的：请检查 PGDATABASE_URL 是否配置正确、网络是否能访问数据库地址（含 5432 端口）、以及是否存在
        IP 白名单/内网限制。
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={props.reset}
          style={{
            borderRadius: 12,
            padding: "8px 10px",
            border: "1px solid rgba(109, 94, 247, 0.22)",
            background: "linear-gradient(135deg, #7b61ff 0%, #5b5ff5 60%, #4f46e5 100%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            borderRadius: 12,
            padding: "8px 10px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.86)",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer"
          }}
        >
          刷新
        </button>
      </div>
    </div>
  )
}

