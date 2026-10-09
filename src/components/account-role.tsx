import { useState } from 'react'
import { LoaderCircle, Mic2, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROLE_NAMES, type Role } from '@/domain/types'
import type { ClientState, RoomTransport } from '@/domain/transport'

export function AccountRoleFields({
  role,
  setRole,
  disabled = false,
  context = 'account',
}: {
  role: Role | null
  setRole: (role: Role) => void
  disabled?: boolean
  context?: 'account' | 'room'
}) {
  return (
    <fieldset className="account-role-fields" disabled={disabled}>
      <legend>{context === 'room' ? '이번 방에서 사용할 역할' : '사용할 역할'}</legend>
      <div className="account-role-options">
        {(['broadcast', 'leader'] as const).map((value) => {
          const Icon = value === 'broadcast' ? Monitor : Mic2
          return (
            <label key={value} className={role === value ? 'selected' : ''}>
              <input
                type="radio"
                name="account-role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
                required
              />
              <Icon size={18} />
              <span>{ROLE_NAMES[value]}</span>
            </label>
          )
        })}
      </div>
      <p className="auth-hint">
        {context === 'room'
          ? '관리자는 입장할 때마다 역할을 선택할 수 있습니다.'
          : '이 계정은 선택한 역할로 사용합니다.'}
      </p>
    </fieldset>
  )
}

export function AccountRoleSetup({ client, state }: { client: RoomTransport; state: ClientState }) {
  const [role, setRole] = useState<Role | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!state.profileReady)
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={22} className="auth-spinner" />
        <p>계정 정보를 확인하고 있습니다.</p>
      </div>
    )
  return (
    <div className="auth-panel">
      <div className="auth-heading">
        <h2>계정 역할 설정</h2>
        <p>기존 계정은 사용할 역할을 한 번만 설정해 주세요.</p>
      </div>
      <form
        className="auth-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!role || busy) return
          setBusy(true)
          setError('')
          try {
            await client.registerRole(role)
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <AccountRoleFields role={role} setRole={setRole} disabled={busy} />
        {(error || state.profileError) && (
          <p className="error-message" role="alert">
            {error || state.profileError}
          </p>
        )}
        <Button type="submit" disabled={busy || !role}>
          {busy ? '저장하고 있습니다…' : '역할을 설정하고 승인 요청'}
        </Button>
      </form>
    </div>
  )
}
