import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ACCOUNT_PASSWORD_MIN, ACCOUNT_PASSWORD_MAX } from '@/domain/auth'
import type { ClientState, RoomTransport } from '@/domain/transport'
import { AccountRoleFields } from '@/components/account-role'
import type { Role } from '@/domain/types'

type Mode = 'login' | 'signup' | 'reset'
type FormProps = {
  client: RoomTransport
  email: string
  setEmail: (value: string) => void
  changeMode: (mode: Mode) => void
}

function AccountForm({ mode, client, email, setEmail, changeMode }: FormProps & { mode: Mode }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const signup = mode === 'signup'
  const reset = mode === 'reset'
  const title = signup ? '회원가입' : reset ? '비밀번호 재설정' : '로그인'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    if (signup && !role) {
      setError('사용할 역할을 선택해 주세요.')
      return
    }
    if (signup && password !== confirm) {
      setError('비밀번호가 서로 다릅니다. 다시 확인해 주세요.')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      if (reset) {
        await client.resetPassword(email)
        setSent(true)
      } else if (signup) await client.signUp(email, password, role!)
      else await client.signIn(email, password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '다시 시도해 주세요.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <div className="auth-panel">
      <div className="auth-heading">
        <h2>{title}</h2>
        <p>
          {signup
            ? '교회 내부 서비스입니다. 가입 후 관리자 승인을 받아 이용하세요.'
            : reset
              ? '가입한 이메일로 재설정 안내를 보내드립니다.'
              : '사용하던 계정으로 대화를 시작하세요.'}
        </p>
      </div>
      {sent ? (
        <div className="auth-reset-confirmation" role="status">
          <Mail size={26} strokeWidth={1.5} />
          <p>가입된 이메일이면 재설정 안내를 보냈습니다. 메일함과 스팸함을 확인해 주세요.</p>
        </div>
      ) : (
        <form
          className="auth-form"
          aria-label={title}
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.repeat))
              event.preventDefault()
          }}
          aria-busy={busy}
        >
          {signup && <AccountRoleFields role={role} setRole={setRole} disabled={busy} />}
          <div className="auth-field">
            <label htmlFor="account-email">이메일</label>
            <Input
              id="account-email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              required
              disabled={busy}
              placeholder="이메일 주소를 입력하세요"
            />
          </div>
          {!reset && (
            <div className="auth-field">
              <label htmlFor="account-password">비밀번호</label>
              <div className="password-field">
                <Input
                  id="account-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  minLength={signup ? ACCOUNT_PASSWORD_MIN : undefined}
                  maxLength={ACCOUNT_PASSWORD_MAX}
                  required
                  disabled={busy}
                  aria-describedby={signup ? 'account-password-hint' : undefined}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showPassword}
                  disabled={busy}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </div>
              {signup && (
                <p id="account-password-hint" className="auth-hint">
                  {ACCOUNT_PASSWORD_MIN}자 이상으로 입력해 주세요.
                </p>
              )}
            </div>
          )}
          {signup && (
            <div className="auth-field">
              <label htmlFor="account-confirm">비밀번호 확인</label>
              <Input
                id="account-confirm"
                name="password-confirmation"
                type={showPassword ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={ACCOUNT_PASSWORD_MIN}
                maxLength={ACCOUNT_PASSWORD_MAX}
                required
                disabled={busy}
              />
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="full-width" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={17} className="auth-spinner" /> 처리하고 있습니다…
              </>
            ) : (
              <>
                {reset ? '재설정 메일 보내기' : signup ? '가입 신청하기' : '로그인'}
                <ArrowRight size={17} />
              </>
            )}
          </Button>
        </form>
      )}
      <div className="auth-navigation">
        {mode === 'login' ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => changeMode('signup')}
            >
              회원가입
            </Button>
            <span aria-hidden="true" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => changeMode('reset')}
            >
              비밀번호 찾기
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => changeMode('login')}
          >
            <ArrowLeft size={15} />
            로그인으로 돌아가기
          </Button>
        )}
      </div>
    </div>
  )
}

function LoginForm(props: FormProps) {
  return <AccountForm {...props} mode="login" />
}
function SignUpForm(props: FormProps) {
  return <AccountForm {...props} mode="signup" />
}
function PasswordResetForm(props: FormProps) {
  return <AccountForm {...props} mode="reset" />
}

export function AuthPanel({ client, state }: { client: RoomTransport; state: ClientState }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  if (!state.authReady || state.authError)
    return (
      <div className="auth-loading" role="status">
        {!state.authError && <LoaderCircle size={22} className="auth-spinner" />}
        <p>{state.authError || '로그인 정보를 확인하고 있습니다.'}</p>
        {state.authError && (
          <Button variant="outline" onClick={client.reconnect}>
            다시 시도
          </Button>
        )}
      </div>
    )
  const props = { client, email, setEmail, changeMode: setMode }
  return (
    <>
      {mode === 'login' ? (
        <LoginForm {...props} />
      ) : mode === 'signup' ? (
        <SignUpForm {...props} />
      ) : (
        <PasswordResetForm {...props} />
      )}
      {!state.persistentLogin && (
        <p className="auth-hint" role="status">
          이 브라우저에서는 로그인 상태를 저장하지 못해 새로 접속할 때 다시 로그인해야 합니다.
        </p>
      )}
    </>
  )
}
