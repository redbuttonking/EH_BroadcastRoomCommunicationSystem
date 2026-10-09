import { useEffect } from 'react'

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
}
const isPhone = () =>
  matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600

export async function preferLandscapeOnPhone() {
  const orientation = screen.orientation as LockableOrientation | undefined
  if (!isPhone() || !orientation?.lock) return
  try {
    await orientation.lock('landscape')
  } catch {
    /* The platform may require fullscreen or not support locking. */
  }
}

export function useRoomOrientation() {
  useEffect(() => {
    void preferLandscapeOnPhone()
    const onFullscreen = () => {
      if (document.fullscreenElement) void preferLandscapeOnPhone()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      try {
        if (isPhone()) screen.orientation?.unlock?.()
      } catch {
        /* Unsupported on some platforms. */
      }
    }
  }, [])
}
