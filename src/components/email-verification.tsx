import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RoomTransport } from '@/domain/transport'

export function EmailVerification({ client }: { client: RoomTransport }) {
  const [busy, setBusy] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!remaining) return
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining])
  const run = async (send: boolean) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (send) {
        await client.sendVerification()
        setRemaining(60)
        setNotice('인증 메일을 보냈습니다. 메일함과 스팸함을 확인해 주세요.')
      } else await client.refreshVerification()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-panel">
      <div className="auth-heading">
        <Mail size={26} strokeWidth={1.5} />
        <h2>이메일 인증이 필요합니다</h2>
        <p>
          본인 이메일의 인증 링크를 눌러 주세요. 이미 승인된 계정은 인증만 마치면 계속 사용할 수
          있습니다. 신규 계정은 인증 후 관리자 승인이 필요합니다.
        </p>
      </div>
      {notice && (
        <p role="status" className="auth-hint">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="verification-actions">
        <Button disabled={busy || remaining > 0} onClick={() => void run(true)}>
          {remaining ? `${remaining}초 후 다시 보내기` : '인증 메일 보내기'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void run(false)}>
          인증 완료 확인
        </Button>
      </div>
    </div>
  )
}
