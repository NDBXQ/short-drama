import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react"
import styles from "./VideoPlayer.module.css"
import { createLocalPreviewSvg } from "../../utils/previewUtils"
import type { PreviewPlaylistItem, TimelineAudioClip } from "../../utils/mediaPreviewUtils"

export function PreviewAllPlayer({
  activeTitle,
  currentItem,
  currentItemDurationSeconds,
  previewAllPlaying,
  previewAllLocalTime,
  previewAllElapsedSeconds,
  nextPreloadVideoSrc,
  timelineAudioClips,
  onAdvancePreviewAll,
  onUpdatePreviewAllLocalTime,
  onMediaAspect,
  onStopPreviewAll
}: {
  activeTitle: string
  currentItem: PreviewPlaylistItem | null
  currentItemDurationSeconds: number
  previewAllPlaying: boolean
  previewAllLocalTime: number
  previewAllElapsedSeconds: number
  nextPreloadVideoSrc?: string
  timelineAudioClips: TimelineAudioClip[]
  onAdvancePreviewAll: () => void
  onUpdatePreviewAllLocalTime: (time: number) => void
  onMediaAspect: (ar: string) => void
  onStopPreviewAll: () => void
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const placeholderTimerRef = useRef<number | null>(null)
  const placeholderIntervalRef = useRef<number | null>(null)
  const advanceGuardRef = useRef<{ until: number }>({ until: 0 })
  const bufferingRetryRef = useRef<number | null>(null)
  const [buffering, setBuffering] = useState(false)

  const currentItemHasVideo = Boolean(currentItem?.videoSrc)

  const clearPlaceholderTimers = () => {
    if (placeholderTimerRef.current) {
      window.clearTimeout(placeholderTimerRef.current)
      placeholderTimerRef.current = null
    }
    if (placeholderIntervalRef.current) {
      window.clearInterval(placeholderIntervalRef.current)
      placeholderIntervalRef.current = null
    }
  }

  const clearBufferingRetry = () => {
    if (bufferingRetryRef.current) {
      window.clearTimeout(bufferingRetryRef.current)
      bufferingRetryRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearBufferingRetry()
      clearPlaceholderTimers()
    }
  }, [])

  const playWithSoundFallback = useCallback((el: HTMLMediaElement) => {
    try {
      ;(el as any).muted = false
      ;(el as any).volume = 1
    } catch {}
    void (el as any).play?.().catch(() => {
      try {
        ;(el as any).muted = true
      } catch {}
      void (el as any).play?.().catch(() => {})
    })
  }, [])

  const safeAdvance = useCallback(() => {
    const now = performance.now()
    if (now < advanceGuardRef.current.until) return
    advanceGuardRef.current.until = now + 300
    const el = videoRef.current
    if (el) el.pause()
    onAdvancePreviewAll()
  }, [onAdvancePreviewAll])

  useEffect(() => {
    if (!currentItem) {
      clearPlaceholderTimers()
      return
    }

    clearPlaceholderTimers()

    if (!previewAllPlaying) {
      const el = videoRef.current
      if (el) el.pause()
      return
    }

    if (currentItem.videoSrc) {
      const el = videoRef.current
      if (!el) return
      playWithSoundFallback(el)
      return
    }

    const initialLocal = Math.max(0, Math.min(currentItemDurationSeconds, previewAllLocalTime))
    const remainingMs = Math.max(0, Math.round((currentItemDurationSeconds - initialLocal) * 1000))
    const startedAt = performance.now()
    placeholderIntervalRef.current = window.setInterval(() => {
      const elapsed = initialLocal + (performance.now() - startedAt) / 1000
      onUpdatePreviewAllLocalTime(Math.min(currentItemDurationSeconds, Math.max(0, elapsed)))
    }, 80)
    placeholderTimerRef.current = window.setTimeout(() => {
      safeAdvance()
    }, remainingMs)
  }, [currentItem, currentItemDurationSeconds, playWithSoundFallback, previewAllLocalTime, previewAllPlaying, onUpdatePreviewAllLocalTime, safeAdvance])

  useEffect(() => {
    const now = Math.max(0, Number(previewAllElapsedSeconds) || 0)
    for (const el of audioRefs.current.values()) {
      try {
        el.pause()
      } catch {}
    }
    for (const clip of timelineAudioClips) {
      const el = audioRefs.current.get(clip.id)
      if (!el) continue
      const src = (clip.src ?? "").trim()
      if (!src) continue

      const start = Number(clip.start) || 0
      const end = start + (Number(clip.duration) || 0)
      const isActive = now >= start && now < end - 1e-3
      if (!isActive) continue

      const desired = Math.max(0, now - start)
      const cur = Number(el.currentTime) || 0
      if (Number.isFinite(desired) && Math.abs(cur - desired) > 0.25) {
        try {
          el.currentTime = desired
        } catch {}
      }

      if (previewAllPlaying) playWithSoundFallback(el)
    }
  }, [playWithSoundFallback, previewAllElapsedSeconds, previewAllPlaying, timelineAudioClips])

  useEffect(() => {
    if (!currentItem?.videoSrc) return
    const el = videoRef.current
    if (!el) return
    const startAt = Math.max(0, Number(currentItem?.trimStartSeconds ?? 0))
    const endAt = Math.max(startAt, (Number(el.duration) || 0) - Math.max(0, Number(currentItem?.trimEndSeconds ?? 0)))
    const desired = Math.max(startAt, Math.min(endAt, startAt + Math.max(0, previewAllLocalTime)))
    const cur = Number(el.currentTime) || 0
    if (Number.isFinite(desired) && Math.abs(cur - desired) > 0.25) {
      el.currentTime = desired
      if (previewAllPlaying) playWithSoundFallback(el)
    }
  }, [currentItem?.trimEndSeconds, currentItem?.trimStartSeconds, currentItem?.videoSrc, playWithSoundFallback, previewAllLocalTime, previewAllPlaying])

  const placeholderSrc = useMemo(() => createLocalPreviewSvg("生成中"), [])

  if (!currentItem) {
    return (
      <div className={styles.previewFallback}>
        <Image src={placeholderSrc} alt={activeTitle} fill unoptimized style={{ objectFit: "contain" }} />
      </div>
    )
  }

  return (
    <>
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden>
        {timelineAudioClips.map((c) => (
          <audio
            key={c.id}
            ref={(el) => {
              if (el) audioRefs.current.set(c.id, el)
              else audioRefs.current.delete(c.id)
            }}
            src={c.src ?? ""}
            preload="auto"
          />
        ))}
        {nextPreloadVideoSrc ? <video src={nextPreloadVideoSrc} preload="auto" playsInline muted /> : null}
      </div>

      {buffering ? (
        <div className={styles.bufferingOverlay} aria-label="缓冲中">
          <div className={styles.bufferingPill}>
            <div className={styles.bufferingSpinner} aria-hidden />
            缓冲中…
          </div>
        </div>
      ) : null}

      {currentItemHasVideo ? (
        <video
          ref={videoRef}
          key={currentItem?.key ?? "preview"}
          src={currentItem?.videoSrc ?? ""}
          preload="auto"
          playsInline
          className={styles.previewVideo}
          onClick={(e) => {
            const el = e.currentTarget
            if (el.paused) {
              playWithSoundFallback(el)
            } else {
              el.pause()
              setBuffering(false)
              clearBufferingRetry()
            }
          }}
          onLoadedMetadata={(e) => {
            setBuffering(false)
            clearBufferingRetry()
            const el = e.currentTarget
            const w = el.videoWidth
            const h = el.videoHeight
            if (w > 0 && h > 0) onMediaAspect(`${w} / ${h}`)
            const startAt = Math.max(0, Number(currentItem?.trimStartSeconds ?? 0))
            const endAt = Math.max(startAt, (Number(el.duration) || 0) - Math.max(0, Number(currentItem?.trimEndSeconds ?? 0)))
            const desired = Math.max(startAt, Math.min(endAt, startAt + Math.max(0, previewAllLocalTime)))
            if (Number.isFinite(desired)) el.currentTime = desired
            if (previewAllPlaying) playWithSoundFallback(el)
          }}
          onWaiting={() => {
            if (!previewAllPlaying) return
            setBuffering(true)
            clearBufferingRetry()
            bufferingRetryRef.current = window.setTimeout(() => {
              const el = videoRef.current
              if (el && previewAllPlaying) playWithSoundFallback(el)
            }, 1500)
          }}
          onStalled={() => {
            if (!previewAllPlaying) return
            setBuffering(true)
          }}
          onCanPlay={() => {
            setBuffering(false)
            clearBufferingRetry()
          }}
          onPlaying={() => {
            setBuffering(false)
            clearBufferingRetry()
          }}
          onError={() => {
            setBuffering(false)
            clearBufferingRetry()
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            const t = Number(el.currentTime) || 0
            const startAt = Math.max(0, Number(currentItem?.trimStartSeconds ?? 0))
            const endAt = Math.max(startAt, (Number(el.duration) || 0) - Math.max(0, Number(currentItem?.trimEndSeconds ?? 0)))
            if (t >= endAt - 0.05) {
              safeAdvance()
              return
            }
            const local = Math.max(0, t - startAt)
            onUpdatePreviewAllLocalTime(Math.min(currentItemDurationSeconds, local))
          }}
          onEnded={() => {
            safeAdvance()
          }}
        />
      ) : (
        <div className={styles.previewFallback}>
          <Image
            src={placeholderSrc}
            alt={currentItem.title ?? activeTitle}
            fill
            unoptimized
            style={{ objectFit: "contain" }}
          />
        </div>
      )}

      <button
        type="button"
        className={styles.previewStopButton}
        onClick={() => {
          setBuffering(false)
          clearBufferingRetry()
          onStopPreviewAll()
        }}
        aria-label="停止全片预览"
      />
    </>
  )
}
