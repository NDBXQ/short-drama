import type { ReactNode } from "react"
import styles from "./ShortDramaPlanningFields.module.css"

function normalizeRangeHintText(input: string): string {
  const shouldNormalize = /(\d+\s*-\s*\d+)|(\d+%\s*-\s*\d+%)|可选/.test(input)
  if (!shouldNormalize) return input

  const lines = input.split(/\r?\n/)
  const normalized = lines.map((line) => {
    const trimmed = line.replace(/[，,]\s*$/g, "")
    const withColonSpace = trimmed.replace(/：\s*/g, "： ")
    const withPercentRange = withColonSpace.replace(/(\d+)%\s*-\s*(\d+)%/g, "$1%–$2%")
    const withNumberRange = withPercentRange.replace(/(\d+)\s*-\s*(\d+)/g, "$1–$2")
    const withUnitSpace = withNumberRange.replace(/(\d+(?:–\d+)?)(集|分钟|个|人|字|场)/g, "$1 $2")
    return withUnitSpace
  })

  return normalized.join("\n")
}

export function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

type BaseFieldProps = Readonly<{
  label: string
  value: string
  editing: boolean
  placeholder?: string
}>

export function TextField({
  label,
  value,
  editing,
  placeholder,
  rows = 4,
  onChange
}: BaseFieldProps & Readonly<{ rows?: number; onChange: (value: string) => void }>) {
  const text = String(value ?? "")
  return (
    <label className={styles.field}>
      <div className={styles.label}>{label}</div>
      {editing ? (
        <textarea
          className={styles.textarea}
          value={text}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      ) : (
        <div className={styles.readonly}>{text.trim() ? normalizeRangeHintText(text) : placeholder ?? "—"}</div>
      )}
    </label>
  )
}

export function SmallField({
  label,
  value,
  editing,
  placeholder,
  onChange
}: BaseFieldProps & Readonly<{ onChange: (value: string) => void }>) {
  const text = String(value ?? "")
  return (
    <label className={styles.field}>
      <div className={styles.label}>{label}</div>
      {editing ? (
        <input
          className={styles.input}
          value={text}
          placeholder={placeholder}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      ) : (
        <div className={styles.readonly}>{text.trim() ? normalizeRangeHintText(text) : placeholder ?? "—"}</div>
      )}
    </label>
  )
}

export function RangeField({
  label,
  value,
  editing,
  min,
  max,
  unit,
  step = 1,
  showTicks = true,
  onChange
}: Readonly<{
  label: string
  value: number
  editing: boolean
  min: number
  max: number
  unit?: string
  step?: number
  showTicks?: boolean
  onChange: (value: number) => void
}>) {
  const clamp = (n: number): number => {
    if (!Number.isFinite(n)) return min
    const snapped = Math.round(n / step) * step
    if (snapped < min) return min
    if (snapped > max) return max
    return snapped
  }

  const safe = clamp(value)
  const marks = (() => {
    if (!showTicks) return [] as Array<{ label: number; percent: number }>
    const span = max - min
    const count = max >= 100 || span >= 200 ? 3 : 6
    if (max <= min) return [{ label: min, percent: 0 }]
    const raw = Array.from({ length: count }, (_, i) => min + (span * i) / (count - 1))
    const uniq = new Set<number>()
    const arr: Array<{ label: number; percent: number }> = []
    for (const r of raw) {
      const v = clamp(r)
      if (uniq.has(v)) continue
      uniq.add(v)
      const p = ((r - min) / span) * 100
      const safeP = !Number.isFinite(p) ? 0 : Math.min(100, Math.max(0, p))
      arr.push({ label: v, percent: safeP })
    }
    return arr
  })()

  const percent = (() => {
    if (max <= min) return 0
    const p = ((safe - min) / (max - min)) * 100
    if (!Number.isFinite(p)) return 0
    if (p < 0) return 0
    if (p > 100) return 100
    return p
  })()

  const adjust = (delta: number) => onChange(clamp(safe + delta))
  const sliderStyle = {
    background: `linear-gradient(90deg, rgba(123,97,255,1) 0%, rgba(123,97,255,1) ${percent}%, rgba(255,255,255,0.14) ${percent}%, rgba(255,255,255,0.14) 100%)`
  } as const

  return (
    <div className={styles.rangeField} aria-label={label}>
      <div className={styles.rangeTop}>
        <div className={styles.rangeLabel}>{label}</div>

        <div className={styles.rangeRight}>
          <div className={styles.valueControl}>
            <button type="button" className={styles.miniBtn} disabled={!editing || safe <= min} onClick={() => adjust(-step)} aria-label="减少">
              −
            </button>
            {editing ? (
              <input
                className={styles.valueInput}
                type="number"
                min={min}
                max={max}
                step={step}
                value={safe}
                onChange={(e) => onChange(clamp(Number(e.currentTarget.value)))}
              />
            ) : (
              <div className={styles.valuePill}>{safe}</div>
            )}
            <button type="button" className={styles.miniBtn} disabled={!editing || safe >= max} onClick={() => adjust(step)} aria-label="增加">
              +
            </button>
            {unit ? <div className={styles.valueUnit}>{unit}</div> : null}
          </div>
        </div>
      </div>

      <div className={styles.rangeMid}>
        <input
          className={styles.range}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safe}
          disabled={!editing}
          style={sliderStyle}
          onChange={(e) => onChange(clamp(Number(e.currentTarget.value)))}
        />
        {showTicks && marks.length ? (
          <div className={styles.ticks} aria-hidden="true">
            {marks.map((m, idx) => {
              const isFirst = idx === 0
              const isLast = idx === marks.length - 1
              const shift = isFirst ? "0%" : isLast ? "-100%" : "-50%"
              return (
                <div
                  key={`${m.label}_${idx}`}
                  className={styles.tick}
                  style={
                    {
                      left: `${m.percent}%`,
                      transform: `translateX(${shift})`
                    } as const
                  }
                >
                  {m.label}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function DurationRangeField({
  label = "单集时长",
  minValue,
  maxValue,
  editing,
  min = 1,
  max = 10,
  step = 1,
  unit,
  onChange
}: Readonly<{
  label?: string
  minValue: number
  maxValue: number
  editing: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (next: { min: number; max: number }) => void
}>) {
  const clamp = (n: number): number => {
    if (!Number.isFinite(n)) return min
    const snapped = Math.round(n / step) * step
    if (snapped < min) return min
    if (snapped > max) return max
    return snapped
  }

  const safeMin = clamp(minValue)
  const safeMax = clamp(maxValue)

  const normalized = (() => {
    if (safeMin <= safeMax) return { min: safeMin, max: safeMax }
    return { min: safeMax, max: safeMin }
  })()

  const percent = (v: number) => {
    if (max <= min) return 0
    const p = ((v - min) / (max - min)) * 100
    if (!Number.isFinite(p)) return 0
    if (p < 0) return 0
    if (p > 100) return 100
    return p
  }

  const sliderStyle = (v: number) =>
    ({
      background: `linear-gradient(90deg, rgba(123,97,255,1) 0%, rgba(123,97,255,1) ${percent(v)}%, rgba(255,255,255,0.14) ${percent(v)}%, rgba(255,255,255,0.14) 100%)`
    }) as const

  const setMin = (v: number) => {
    const nextMin = clamp(v)
    const nextMax = Math.max(nextMin, normalized.max)
    onChange({ min: nextMin, max: nextMax })
  }

  const setMax = (v: number) => {
    const nextMax = clamp(v)
    const nextMin = Math.min(nextMax, normalized.min)
    onChange({ min: nextMin, max: nextMax })
  }

  return (
    <div className={styles.rangeField} aria-label={label}>
      <div className={styles.rangeTop}>
        <div className={styles.rangeLabel}>{label}</div>

        <div className={styles.rangeRight}>
          <div className={styles.durationControl}>
            <button type="button" className={styles.miniBtn} disabled={!editing || normalized.min <= min} onClick={() => setMin(normalized.min - step)} aria-label="减少最小时长">
              −
            </button>
            {editing ? (
              <input
                className={styles.valueInput}
                type="number"
                min={min}
                max={max}
                step={step}
                value={normalized.min}
                onChange={(e) => setMin(Number(e.currentTarget.value))}
              />
            ) : (
              <div className={styles.valuePill}>{normalized.min}</div>
            )}
            <button type="button" className={styles.miniBtn} disabled={!editing || normalized.min >= normalized.max} onClick={() => setMin(normalized.min + step)} aria-label="增加最小时长">
              +
            </button>

            <div className={styles.durationSep} aria-hidden="true">
              —
            </div>

            <button type="button" className={styles.miniBtn} disabled={!editing || normalized.max <= normalized.min} onClick={() => setMax(normalized.max - step)} aria-label="减少最大时长">
              −
            </button>
            {editing ? (
              <input
                className={styles.valueInput}
                type="number"
                min={min}
                max={max}
                step={step}
                value={normalized.max}
                onChange={(e) => setMax(Number(e.currentTarget.value))}
              />
            ) : (
              <div className={styles.valuePill}>{normalized.max}</div>
            )}
            <button type="button" className={styles.miniBtn} disabled={!editing || normalized.max >= max} onClick={() => setMax(normalized.max + step)} aria-label="增加最大时长">
              +
            </button>
            {unit ? <div className={styles.valueUnit}>{unit}</div> : null}
          </div>
        </div>
      </div>

      <div className={styles.durationSliders}>
        <div className={styles.durationRow}>
          <div className={styles.durationRowLabel}>最小</div>
          <input
            className={styles.range}
            type="range"
            min={min}
            max={max}
            step={step}
            value={normalized.min}
            disabled={!editing}
            style={sliderStyle(normalized.min)}
            onChange={(e) => setMin(Number(e.currentTarget.value))}
          />
        </div>
        <div className={styles.durationRow}>
          <div className={styles.durationRowLabel}>最大</div>
          <input
            className={styles.range}
            type="range"
            min={min}
            max={max}
            step={step}
            value={normalized.max}
            disabled={!editing}
            style={sliderStyle(normalized.max)}
            onChange={(e) => setMax(Number(e.currentTarget.value))}
          />
        </div>
      </div>
    </div>
  )
}
