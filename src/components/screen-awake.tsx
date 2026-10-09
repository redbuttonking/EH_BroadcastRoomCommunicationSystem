import { useEffect, useState } from 'react'
import { Lightbulb, LightbulbOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ScreenAwake() {
  const [enabled, setEnabled] = useState(false)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const supported = 'wakeLock' in navigator
  useEffect(() => {
    if (!enabled || !supported) return
    let disposed = false
    let lock: WakeLockSentinel | null = null
    let requesting = false
    const acquire = async () => {
      if (disposed || requesting || lock || document.visibilityState !== 'visible') return
      requesting = true
      try {
        const next = await navigator.wakeLock.request('screen')
        if (disposed) {
          await next.release()
          return
        }
        lock = next
        setActive(true)
        setError('')
        next.addEventListener('release', () => {
          if (lock === next) lock = null
          if (!disposed) setActive(false)
        })
      } catch {
        if (!disposed) setError('화면 유지를 켜지 못했습니다. 기기의 절전 설정을 확인해 주세요.')
      } finally {
        requesting = false
      }
    }
    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release().catch(() => {})
      setActive(false)
    }
  }, [enabled, supported])
  return (
    <span className="fullscreen-control">
      <Button
        variant="ghost"
        size="icon"
        disabled={!supported}
        aria-pressed={enabled}
        aria-label={enabled ? '화면 유지 끄기' : '화면 유지 켜기'}
        title={
          !supported
            ? '이 환경에서는 화면 유지를 지원하지 않습니다.'
            : active
              ? '화면을 켜 두고 있습니다.'
              : enabled
                ? '화면 유지 대기 중'
                : '대화 중 화면 유지 켜기'
        }
        onClick={() => {
          setError('')
          setEnabled((value) => !value)
        }}
      >
        {active ? <Lightbulb size={18} /> : <LightbulbOff size={18} />}
      </Button>
      {error && (
        <span className="fullscreen-error" role="status">
          {error}
        </span>
      )}
    </span>
  )
}
