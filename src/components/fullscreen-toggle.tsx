import { useEffect, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FullscreenToggle() {
  const [active, setActive] = useState(!!document.fullscreenElement)
  const [error, setError] = useState('')
  const appFullscreen = matchMedia('(display-mode: fullscreen)').matches && !active
  const unavailable = !document.fullscreenEnabled || appFullscreen
  const label = active || appFullscreen ? '전체 화면 종료' : '전체 화면'
  useEffect(() => {
    const changed = () => {
      setActive(!!document.fullscreenElement)
      setError('')
    }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  return (
    <span className="fullscreen-control">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        disabled={unavailable}
        title={
          appFullscreen
            ? '설치된 앱의 전체 화면 모드입니다.'
            : !document.fullscreenEnabled
              ? '이 환경에서는 전체 화면 전환을 지원하지 않습니다.'
              : label
        }
        onClick={async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen()
            else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
          } catch {
            setError('이 환경에서는 전체 화면으로 전환하지 못했습니다.')
          }
        }}
      >
        {active || appFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </Button>
      {error && (
        <span className="fullscreen-error" role="status">
          {error}
        </span>
      )}
    </span>
  )
}
