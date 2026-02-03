"use client"

import { useMemo, type ReactElement } from "react"
import styles from "./ApiTesterPage.module.css"
import { useAdminRoutes } from "./useAdminRoutes"
import { useApiTester } from "./useApiTester"
import { RouteSidebar } from "./RouteSidebar"
import { RequestPanel } from "./RequestPanel"
import { ResponsePanel } from "./ResponsePanel"
import { HistoryModal } from "./HistoryModal"

export function ApiTesterPage(): ReactElement {
  const { loading: routesLoading, error: routesError, items: routes, source: routesSource, refresh: refreshRoutes } = useAdminRoutes()
  const state = useApiTester(routes)

  const filteredRoutes = useMemo(() => {
    const q = state.filter.trim().toLowerCase()
    if (!q) return routes
    return routes.filter((r) => r.route.toLowerCase().includes(q) || r.methods.join(",").toLowerCase().includes(q) || r.file.toLowerCase().includes(q))
  }, [routes, state.filter])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.topLeft}>
          <div className={styles.topTitle}>API 测试台</div>
          <div className={styles.topMeta}>
            {routesLoading ? "接口目录加载中…" : routesError ? routesError : `${routes.length} 条接口${routesSource ? ` · ${routesSource}` : ""}`}
          </div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.topBtn} onClick={() => state.setHistoryOpen(!state.historyOpen)}>
            历史
          </button>
          <button type="button" className={styles.topBtn} onClick={refreshRoutes} disabled={routesLoading}>
            刷新目录
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        <RouteSidebar routes={filteredRoutes} filter={state.filter} setFilter={state.setFilter} activeRoute={state.activeRoute} onSelectRoute={state.setActiveRoute} />
        <RequestPanel
          draft={state.draft}
          setDraft={state.setDraft}
          running={state.resp.running}
          onSend={() => void state.sendRequest()}
          onStop={state.stopStream}
          onCopyCurl={() => void state.copyCurl()}
          onClearResponse={state.clearResponse}
          updateHeader={state.updateHeader}
          addHeader={state.addHeader}
          removeHeader={state.removeHeader}
          updateField={state.updateField}
          addField={state.addField}
          removeField={state.removeField}
        />
        <ResponsePanel draft={state.draft} resp={state.resp} />
      </div>

      <HistoryModal open={state.historyOpen} history={state.history} onClose={() => state.setHistoryOpen(false)} onPick={state.pickHistory} />
    </main>
  )
}

