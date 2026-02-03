import type { ReactElement } from "react"
import styles from "./ApiTesterPage.module.css"
import type { ApiRouteItem } from "./types"

export function RouteSidebar({
  routes,
  filter,
  setFilter,
  activeRoute,
  onSelectRoute
}: {
  routes: ApiRouteItem[]
  filter: string
  setFilter: (v: string) => void
  activeRoute: ApiRouteItem | null
  onSelectRoute: (r: ApiRouteItem) => void
}): ReactElement {
  return (
    <aside className={styles.sidebar} aria-label="接口目录">
      <div className={styles.searchRow}>
        <input className={styles.search} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="搜索 /api/..." aria-label="搜索接口" />
      </div>
      <div className={styles.routeList}>
        {routes.map((r) => (
          <button
            type="button"
            key={r.route}
            className={`${styles.routeItem} ${activeRoute?.route === r.route ? styles.routeItemActive : ""}`}
            onClick={() => onSelectRoute(r)}
            title={r.file}
          >
            <span className={styles.routePath}>{r.route}</span>
            <span className={styles.routeMethods}>{(r.methods ?? []).join(",")}</span>
          </button>
        ))}
        {routes.length === 0 ? <div className={styles.empty}>无匹配接口</div> : null}
      </div>
    </aside>
  )
}

