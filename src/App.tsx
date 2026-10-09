import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  House,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Minus,
  Moon,
  Plus,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalHeader } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import {
  FONT_MAX,
  FONT_MIN,
  FONT_STEP,
  readFontSize,
  saveFontSize,
  readTheme,
  saveTheme,
  type Theme,
} from '@/domain/preferences'
import {
  AccountPresetDialog,
  AccountPresetSettings,
  useAccountPresets,
} from '@/components/account-presets'
import { InstallApp } from '@/components/install-app'
import { FullscreenToggle } from '@/components/fullscreen-toggle'
import { AuthPanel } from '@/components/auth-panel'
import { EmailVerification } from '@/components/email-verification'
import { ScreenAwake } from '@/components/screen-awake'
import { AccountRoleFields, AccountRoleSetup } from '@/components/account-role'
import { AccountApproval, ApprovalAdmin } from '@/components/account-approval'
import { useRoomOrientation } from '@/lib/orientation'
import {
  MAX_MESSAGE_LENGTH,
  ROLE_NAMES,
  ROOM_NAME_MAX,
  defaultRoomName,
  type Role,
} from '@/domain/types'
import type { RoomTransport } from '@/domain/transport'

type Props = { client: RoomTransport }
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})
function getTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  try {
    return readTheme(localStorage, prefersDark)
  } catch {
    return readTheme(undefined, prefersDark)
  }
}
function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext)
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === 'dark' ? '화이트모드로 전환' : '다크모드로 전환'}
      title={theme === 'dark' ? '화이트모드로 전환' : '다크모드로 전환'}
      onClick={toggle}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  )
}
function getFontSize() {
  try {
    return readFontSize(localStorage)
  } catch {
    return readFontSize(undefined)
  }
}

export function App({ client, preview = false }: Props & { preview?: boolean }) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const [fontSize, setFontSize] = useState(getFontSize)
  const [theme, setTheme] = useState(getTheme)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      saveTheme(localStorage, next)
    } catch {
      /* Optional preference. */
    }
  }
  const changeFont = (delta: number) => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta))
    setFontSize(next)
    try {
      saveFontSize(localStorage, next)
    } catch {
      /* Storage is optional. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, toggle: toggleTheme }}>
      <div
        className={`app ${state.room ? 'in-room' : ''}`}
        style={{ '--chat-font': `${fontSize}px` } as CSSProperties}
      >
        {preview && <div className="preview-strip">개발 미리보기 · Firebase 에뮬레이터</div>}
        {state.account && state.connection !== 'connected' && (
          <div className="connection-banner" role="status">
            <span className="status-dot is-pending" />
            <span>
              {state.connection === 'connecting'
                ? '연결하고 있습니다.'
                : '연결이 끊어졌습니다. 다시 연결하고 있습니다.'}
            </span>
            <Button variant="ghost" size="sm" onClick={client.reconnect}>
              <RefreshCw size={14} /> 다시 연결
            </Button>
          </div>
        )}
        {state.account?.emailVerified &&
        state.account.approval === 'approved' &&
        state.accessReady &&
        state.room &&
        state.membership ? (
          <RoomView client={client} fontSize={fontSize} changeFont={changeFont} />
        ) : (
          <Lobby key={state.account?.uid || 'signed-out'} client={client} />
        )}
      </div>
    </ThemeContext.Provider>
  )
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src="/icons/icon-192.png?v=2" alt="" width={36} height={36} />
      </span>
      <span className="brand-name">
        <span>은혜장로교회</span> <span>예배소통 시스템</span>
      </span>
    </div>
  )
}

function Lobby({ client }: Props) {
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const role = state.account?.role ?? null
  const isAdmin = state.account?.isAdmin === true
  const canCreate = isAdmin || role === 'broadcast'
  const [joinRole, setJoinRole] = useState<Role | null>(null)
  const entryRole = isAdmin ? joinRole : role
  const [code, setCode] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [roomName, setRoomName] = useState(defaultRoomName)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showRooms, setShowRooms] = useState(true)
  const [cleanupCode, setCleanupCode] = useState<string | null>(null)
  const [cleanupError, setCleanupError] = useState('')
  const managing = !!state.account?.isAdmin && !showRooms
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !password || (!creating && !entryRole)) return
    setBusy(true)
    setError('')
    try {
      if (creating) await client.request({ type: 'create', name: roomName, password })
      else if (code && entryRole)
        await client.request({ type: 'join', code, password, role: entryRole })
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '입장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <header className="lobby-header">
        <Brand />
        <div className="lobby-actions">
          <ThemeToggle />
          {state.account?.isAdmin && state.account.emailVerified && state.accessReady && (
            <Button
              className="admin-page-switch"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setShowRooms(managing)}
            >
              {managing ? <House size={16} /> : <ShieldCheck size={16} />}
              {managing ? '기본 홈' : '가입 승인 관리'}
            </Button>
          )}
          {state.account && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  await client.signOut()
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : '로그아웃하지 못했습니다.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <LogOut size={16} />
              <span>로그아웃</span>
            </Button>
          )}
        </div>
      </header>
      <main className={`lobby-main${managing && state.account?.isAdmin ? ' is-managing' : ''}`}>
        <div className="lobby-intro">
          <span className="eyebrow">예배를 위한 소통</span>
          <h1>
            {state.account ? (
              <>
                예배를 위한 <br />
                대화를 시작해요.
              </>
            ) : (
              <>
                예배의 흐름을 <br />
                함께 이어가요.
              </>
            )}
          </h1>
          <p>
            {state.account
              ? state.account.approval === 'approved'
                ? '대화방을 선택하고 참여하세요.'
                : '가입 신청은 교회 관리자가 확인합니다.'
              : '로그인하고 대화에 참여하세요.'}
            <br />
            필요한 말은 버튼 한 번으로 전할 수 있어요.
          </p>
          <InstallApp />
          <div className="lobby-note">
            <LockKeyhole size={15} />
            <span>방송실이 방을 닫으면 대화가 삭제됩니다.</span>
          </div>
        </div>
        <section
          className={`entry-panel${managing && state.account?.isAdmin ? ' managing-accounts' : ''}`}
          aria-label={state.account ? '계정 정보와 방 입장' : '계정 접속'}
        >
          {state.account && (
            <div className="account-summary">
              <span title={state.account.email}>{state.account.email}</span>
              <span className="account-role-label">
                {state.account.isAdmin
                  ? '관리자 · 로그인됨'
                  : role
                    ? `${ROLE_NAMES[role]} · 로그인됨`
                    : '계정 확인 중'}
              </span>
            </div>
          )}
          {!state.account ? (
            <AuthPanel client={client} state={state} />
          ) : !state.account.emailVerified ? (
            <EmailVerification client={client} />
          ) : !state.accessReady ||
            !state.profileReady ||
            state.accessError ||
            state.profileError ? (
            <AccountApproval state={state} />
          ) : managing && state.account.isAdmin ? (
            <ApprovalAdmin client={client} ownUid={state.account.uid} />
          ) : !role && !isAdmin ? (
            <AccountRoleSetup client={client} state={state} />
          ) : state.account.approval !== 'approved' ? (
            <AccountApproval state={state} />
          ) : (
            <>
              {!creating && !code && <AccountPresetSettings client={client} />}
              {!creating && !code && (
                <div className="room-options">
                  <div className="section-label">
                    <h2>열려 있는 방</h2>
                    <span>{state.rooms.length}개</span>
                  </div>
                  {state.rooms.length === 0 ? (
                    <div className="no-rooms">
                      <MessageSquare size={23} strokeWidth={1.4} />
                      <p>아직 열려 있는 방이 없어요.</p>
                      <span>
                        {canCreate
                          ? '새 방을 만들고 인도자를 초대해 주세요.'
                          : '방송실에서 방을 만들면 여기에 표시됩니다.'}
                      </span>
                    </div>
                  ) : (
                    <div className="room-list">
                      {state.rooms.map((room) => (
                        <div className="room-option-wrap" key={room.code}>
                          <button
                            key={room.code}
                            className="room-option"
                            data-room-code={room.code}
                            onClick={() => {
                              setCode(room.code)
                              setJoinRole(null)
                              setPassword('')
                              setError('')
                            }}
                          >
                            <span>
                              <span className="room-option-label">대화방</span>
                              <span className="room-option-name">{room.name}</span>
                            </span>
                            <ChevronRight size={18} />
                          </button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${room.name} 정리`}
                              onClick={() => {
                                setCleanupCode(room.code)
                                setCleanupError('')
                              }}
                            >
                              <Trash2 size={17} />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {canCreate && (
                    <Button
                      className="full-width"
                      onClick={() => {
                        setCreating(true)
                        setRoomName(defaultRoomName())
                        setError('')
                      }}
                      disabled={state.connection !== 'connected'}
                    >
                      <Plus size={17} /> 새 방 만들기
                    </Button>
                  )}
                </div>
              )}
              {(creating || code) && (
                <form className="entry-form" onSubmit={submit}>
                  <Button
                    className="back-button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCreating(false)
                      setCode(null)
                      setPassword('')
                      setError('')
                    }}
                    disabled={busy}
                  >
                    <ArrowLeft size={14} /> 방 목록
                  </Button>
                  <h2>
                    {creating
                      ? '새 대화방 만들기'
                      : state.rooms.find((room) => room.code === code)?.name || `대화방 ${code}`}
                  </h2>
                  <p>
                    {creating
                      ? isAdmin
                        ? '새 방에는 방송실로 입장합니다. 함께할 분에게 비밀번호를 알려 주세요.'
                        : '입장할 분에게 비밀번호를 알려 주세요.'
                      : '방송실에서 알려준 비밀번호로 입장하세요.'}
                  </p>
                  {isAdmin && !creating && (
                    <AccountRoleFields
                      role={joinRole}
                      setRole={setJoinRole}
                      disabled={busy}
                      context="room"
                    />
                  )}
                  {creating && (
                    <>
                      <label htmlFor="room-name">방 이름</label>
                      <Input
                        id="room-name"
                        value={roomName}
                        onChange={(event) => setRoomName(event.target.value)}
                        maxLength={ROOM_NAME_MAX}
                        required
                        autoComplete="off"
                      />
                    </>
                  )}
                  <label htmlFor="room-password">방 비밀번호</label>
                  <div className="password-field">
                    <Input
                      id="room-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      maxLength={128}
                      required
                      autoComplete={creating ? 'new-password' : 'current-password'}
                      autoCapitalize="none"
                      spellCheck={false}
                      disabled={busy}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </Button>
                  </div>
                  {error && (
                    <p className="error-message" role="alert">
                      {error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="full-width"
                    disabled={
                      busy ||
                      !password ||
                      (!creating && !entryRole) ||
                      state.connection !== 'connected'
                    }
                  >
                    {busy ? '입장하고 있습니다…' : creating ? '방 만들기' : '입장하기'}
                    <ArrowRight size={16} />
                  </Button>
                </form>
              )}
              {error && !creating && !code && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              {state.notice && (
                <p className="lobby-notice" role="status">
                  {state.notice}
                </p>
              )}
            </>
          )}
        </section>
      </main>
      <Modal
        open={!!cleanupCode}
        onDismiss={() => setCleanupCode(null)}
        titleId="cleanup-title"
        disabled={busy}
      >
        <ModalHeader
          title="사용하지 않는 방을 정리할까요?"
          titleId="cleanup-title"
          onDismiss={() => setCleanupCode(null)}
          disabled={busy}
        />
        <p>{state.rooms.find((room) => room.code === cleanupCode)?.name}</p>
        <p>참여자가 없는 방만 정리할 수 있습니다. 방과 대화는 삭제되며 복구할 수 없습니다.</p>
        {cleanupError && (
          <p className="error-message" role="alert">
            {cleanupError}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              if (!cleanupCode || busy) return
              setBusy(true)
              setCleanupError('')
              try {
                await client.closeUnusedRoom(cleanupCode)
                setCleanupCode(null)
              } catch (reason) {
                setCleanupError(reason instanceof Error ? reason.message : '정리하지 못했습니다.')
              } finally {
                setBusy(false)
              }
            }}
          >
            방과 대화 삭제
          </Button>
        </div>
      </Modal>
      <footer className="lobby-footer">
        <span>© {new Date().getFullYear()} 은혜장로교회. All rights reserved.</span>
        <address>
          경기도 의왕시 <span className="keep-together">부곡시장길 40-1</span>{' '}
          <span className="keep-together">(삼동 174-1)</span>
        </address>
      </footer>
    </>
  )
}

function RoomView({
  client,
  fontSize,
  changeFont,
}: Props & { fontSize: number; changeFont: (delta: number) => void }) {
  useRoomOrientation()
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const { room, membership } = state
  const [draft, setDraft] = useState('')
  const draftRef = useRef('')
  const draftAttempt = useRef<{ text: string; id: string } | null>(null)
  const [editingPresets, setEditingPresets] = useState(false)
  const {
    collection,
    error: presetsError,
    retry: retryPresets,
  } = useAccountPresets(client, membership!.role)
  const presets = collection?.items ?? []
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<'close' | 'leave' | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasNew, setHasNew] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const cooldownTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(cooldownTimer.current), [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const composeRef = useRef<HTMLTextAreaElement>(null)
  const previousCount = useRef(0)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const isLeader = membership?.role === 'leader'
  const connected = state.connection === 'connected'
  useEffect(() => {
    const element = scrollRef.current
    const count = (room?.messages.length ?? 0) + (room?.events.length ?? 0) + state.pending.length
    if (element && atBottom.current) element.scrollTop = element.scrollHeight
    else if (count > previousCount.current) setHasNew(true)
    previousCount.current = count
  }, [room?.messages.length, room?.events.length, state.pending.length, fontSize])
  if (!room || !membership) return null
  const otherRole: Role = isLeader ? 'broadcast' : 'leader'
  const timeline = [
    ...room.messages.map((message) => ({ ...message, kind: 'message' as const })),
    ...room.events.map((event) => ({ ...event, kind: 'event' as const })),
  ].sort((a, b) => {
    const order = (item: typeof a) => (item.kind === 'message' ? 1 : item.type === 'joined' ? 0 : 2)
    return a.sentAt - b.sentAt || order(a) - order(b) || a.id.localeCompare(b.id)
  })
  const send = async (text: string, retryId?: string) => {
    setError('')
    setCooldown(true)
    window.clearTimeout(cooldownTimer.current)
    try {
      await client.sendMessage(text, retryId)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '전송하지 못했습니다.')
      return false
    } finally {
      cooldownTimer.current = window.setTimeout(() => setCooldown(false), 550)
    }
  }
  const sendDraft = async () => {
    const submitted = draftRef.current
    if (!submitted.trim() || !connected || busy || cooldown) return
    if (draftAttempt.current?.text !== submitted)
      draftAttempt.current = { text: submitted, id: crypto.randomUUID() }
    setBusy(true)
    if (await send(submitted, draftAttempt.current.id)) {
      draftAttempt.current = null
      if (draftRef.current === submitted) {
        draftRef.current = ''
        setDraft('')
      }
    }
    setBusy(false)
  }
  const endRoom = async (action = dialog) => {
    if (!action) return
    setBusy(true)
    try {
      await client.request({ type: action })
      setDialog(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.')
      setDialog(null)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <header className="room-header" data-room-code={room.code}>
        <Brand />
        <div className="room-identity">
          <span className="room-name" title={room.name}>
            {room.name}
          </span>
          <span className="room-role">{ROLE_NAMES[membership.role]}</span>
        </div>
        <div className="room-toolbar">
          <FullscreenToggle />
          <ScreenAwake />
          <ThemeToggle />
          <div className="font-control" role="group" aria-label="대화와 버튼 글자 크기">
            <span>글자</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="글자 작게"
              onClick={() => changeFont(-FONT_STEP)}
              disabled={fontSize <= FONT_MIN}
            >
              <Minus size={16} />
            </Button>
            <output aria-label="글자 크기">{fontSize}</output>
            <Button
              variant="ghost"
              size="icon"
              aria-label="글자 크게"
              onClick={() => changeFont(FONT_STEP)}
              disabled={fontSize >= FONT_MAX}
            >
              <Plus size={16} />
            </Button>
          </div>
          <span className="toolbar-divider" />
          <Button variant="ghost" size="sm" onClick={() => setDialog('leave')}>
            <LogOut size={16} />
            <span>나가기</span>
          </Button>
          {membership.canClose && (
            <Button
              className="close-room-shortcut"
              variant="outline"
              size="sm"
              onClick={() => setDialog('close')}
            >
              방 닫기
            </Button>
          )}
        </div>
      </header>
      <div className="rotate-guide for-phone" role="status">
        <Smartphone size={34} strokeWidth={1.3} />
        <h2>휴대폰을 가로로 돌려주세요.</h2>
        <p>
          왼쪽에서 대화를 보고
          <br />
          오른쪽 버튼으로 요청할 수 있어요.
        </p>
      </div>
      <main className={`room-layout ${isLeader ? 'leader-layout' : 'broadcast-layout'}`}>
        <section className="conversation" aria-label="대화">
          <div className="panel-heading">
            <h1 className="conversation-title" title={room.name}>
              대화 - {room.name}
            </h1>
            <span className="presence">
              <span
                className={`status-dot ${room.participants[otherRole] > 0 && connected ? '' : 'is-pending'}`}
              />
              {ROLE_NAMES[otherRole]}{' '}
              {room.participants[otherRole] > 0 && connected ? '접속 중' : '연결 대기'}
            </span>
          </div>
          <div
            className="chat-scroll"
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 45
              if (atBottom.current) setHasNew(false)
            }}
            tabIndex={0}
            aria-label="대화 내용"
          >
            {state.hasEarlier && (
              <Button
                variant="ghost"
                size="sm"
                className="history-more"
                disabled={!connected || state.loadingEarlier}
                onClick={async () => {
                  const element = scrollRef.current
                  if (!element) return
                  const height = element.scrollHeight,
                    top = element.scrollTop
                  atBottom.current = false
                  try {
                    await client.loadEarlier()
                    requestAnimationFrame(() => {
                      element.scrollTop = top + element.scrollHeight - height
                    })
                  } catch {
                    setError('이전 대화를 불러오지 못했습니다. 연결 후 다시 시도해 주세요.')
                  }
                }}
              >
                {state.loadingEarlier ? '불러오고 있습니다…' : '이전 대화 보기'}
              </Button>
            )}
            <div className="chat-start">
              <LockKeyhole size={13} />
              <span>이 방이 열려 있는 동안만 대화가 남습니다.</span>
            </div>
            {room.messages.length === 0 && (
              <div className="chat-empty">
                <MessageSquare size={30} strokeWidth={1.2} />
                <p>대화를 시작해 보세요.</p>
                <span>오른쪽 문구를 누르면 바로 전송됩니다.</span>
              </div>
            )}
            {timeline.map((message, index) =>
              message.kind === 'event' ? (
                <div className="room-event" key={message.id}>
                  {ROLE_NAMES[message.role]}
                  {message.type === 'disconnected'
                    ? '의 연결이 끊어졌습니다.'
                    : `${message.role === 'broadcast' ? '이' : '가'} ${message.type === 'joined' ? '들어왔습니다.' : '나갔습니다.'}`}
                </div>
              ) : (
                <article
                  className={`message ${message.role === membership.role ? 'mine' : 'theirs'}`}
                  key={message.id}
                >
                  {(index === 0 ||
                    timeline[index - 1].kind === 'event' ||
                    timeline[index - 1].role !== message.role) && (
                    <span className="message-author">{ROLE_NAMES[message.role]}</span>
                  )}
                  <div className="message-line">
                    <div className="message-bubble" translate="no">
                      {message.text}
                    </div>
                    <time dateTime={new Date(message.sentAt).toISOString()}>
                      {new Date(message.sentAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </time>
                  </div>
                </article>
              ),
            )}
            {state.pending.map((message) => (
              <article className="message mine pending-message" key={message.id}>
                <div className="message-bubble">{message.text}</div>
                <span className="pending-caption">
                  {message.state === 'sending' ? '전송 중' : '전송 확인 필요'}
                  {message.state === 'uncertain' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!connected}
                      onClick={() => void send(message.text, message.id)}
                    >
                      다시 전송
                    </Button>
                  )}
                </span>
              </article>
            ))}
          </div>
          {hasNew && (
            <Button
              className="new-messages"
              size="sm"
              variant="outline"
              onClick={() => {
                const el = scrollRef.current
                if (el) el.scrollTop = el.scrollHeight
                atBottom.current = true
                setHasNew(false)
              }}
            >
              <ArrowDown size={14} /> 새 메시지
            </Button>
          )}
          <div className="composer-area">
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault()
                void sendDraft()
              }}
            >
              <textarea
                ref={composeRef}
                value={draft}
                onChange={(event) => {
                  draftRef.current = event.target.value
                  setDraft(event.target.value)
                }}
                placeholder="메시지를 입력하세요"
                aria-label="메시지 입력"
                maxLength={MAX_MESSAGE_LENGTH}
                rows={1}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault()
                    if (!event.repeat) void sendDraft()
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="메시지 보내기"
                disabled={!connected || !draft.trim() || busy || cooldown}
              >
                <Send size={19} />
              </Button>
            </form>
          </div>
        </section>
        <section className="presets-panel" aria-label="빠른 문구">
          <div className="panel-heading">
            <h2>빠른 문구</h2>
            <Button
              variant="ghost"
              size="sm"
              aria-label="빠른 문구 편집"
              onClick={() => setEditingPresets(true)}
              disabled={!collection}
            >
              <Pencil size={15} /> 편집
            </Button>
          </div>
          <div className="preset-list">
            {presetsError ? (
              <div className="presets-empty" role="alert">
                <p>{presetsError}</p>
                <Button variant="outline" size="sm" onClick={retryPresets}>
                  다시 불러오기
                </Button>
              </div>
            ) : (
              !collection && (
                <p className="presets-empty" role="status">
                  문구를 불러오고 있습니다…
                </p>
              )
            )}
            <div className="preset-grid">
              {collection && presets.length === 0 && (
                <p className="presets-empty">편집에서 문구를 추가해 주세요.</p>
              )}
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  className="preset-button"
                  disabled={!connected || cooldown}
                  translate="no"
                  onPointerDown={(event) => {
                    pointerStart.current = { x: event.clientX, y: event.clientY }
                    moved.current = false
                  }}
                  onPointerMove={(event) => {
                    if (
                      pointerStart.current &&
                      Math.hypot(
                        event.clientX - pointerStart.current.x,
                        event.clientY - pointerStart.current.y,
                      ) > 10
                    )
                      moved.current = true
                  }}
                  onPointerCancel={() => {
                    moved.current = true
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && event.repeat)
                      event.preventDefault()
                  }}
                  onClick={(event) => {
                    if (event.detail !== 0 && moved.current) return
                    void send(preset.text)
                  }}
                >
                  <span className="preset-text">{preset.text}</span>
                  <ArrowRight className="preset-arrow" size={18} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
          <div className="preset-footnote">문구 내용 그대로 대화에 전송됩니다.</div>
        </section>
      </main>
      {editingPresets && (
        <AccountPresetDialog
          client={client}
          role={membership.role}
          onClose={() => setEditingPresets(false)}
        />
      )}
      {error && (
        <div className="room-error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="icon" aria-label="알림 닫기" onClick={() => setError('')}>
            <X size={15} />
          </Button>
        </div>
      )}
      <Modal
        open={dialog !== null}
        className="room-exit-dialog"
        titleId="room-exit-title"
        onDismiss={() => setDialog(null)}
        disabled={busy}
      >
        <ModalHeader
          title={
            dialog === 'close'
              ? '대화방을 닫을까요?'
              : membership.canClose
                ? '방을 어떻게 나갈까요?'
                : '방에서 나갈까요?'
          }
          titleId="room-exit-title"
          onDismiss={() => setDialog(null)}
          disabled={busy}
        />
        <p>
          {dialog === 'close'
            ? '모든 참여자가 나가고 대화 내용이 삭제됩니다.'
            : membership.canClose
              ? '방을 유지하면 대화도 남습니다. 완전히 닫으면 모든 참여자가 나가고 대화가 삭제됩니다.'
              : '다시 입장하면 이전 대화를 볼 수 있어요. 방송실이 방을 닫으면 대화가 삭제됩니다.'}
        </p>
        <div
          className={`dialog-actions${dialog === 'leave' && membership.canClose ? ' dialog-actions-pair' : ''}`}
        >
          <Button
            variant={dialog === 'close' ? 'destructive' : 'default'}
            onClick={() => void endRoom()}
            disabled={busy || (dialog === 'close' && !connected)}
          >
            {dialog === 'close'
              ? '방 닫기'
              : membership.canClose
                ? '방을 유지하고 나가기'
                : '나가기'}
          </Button>
          {dialog === 'leave' && membership.canClose && (
            <Button
              variant="destructive"
              onClick={() => void endRoom('close')}
              disabled={busy || !connected}
            >
              방을 완전히 닫기
            </Button>
          )}
        </div>
      </Modal>
    </>
  )
}
