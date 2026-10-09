import { initializeApp, type FirebaseOptions } from 'firebase/app'
import {
  beforeAuthStateChanged,
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  connectDatabaseEmulator,
  getDatabase,
  goOffline,
  goOnline,
  onDisconnect,
  onValue,
  get,
  query,
  orderByChild,
  limitToLast,
  endBefore,
  ref,
  type Database,
  type OnDisconnect,
  type Unsubscribe,
} from 'firebase/database'
import type {
  ClientCommand,
  Membership,
  Role,
  RoomSnapshot,
  RoomEvent,
  Preset,
} from '@/domain/types'
import { parsePresetCollection, validPresets, type PresetCollection } from '@/domain/presets'
import { MAX_MESSAGE_LENGTH, ROLE_NAMES, ROOM_NAME_MAX } from '@/domain/types'
import type {
  AccountApplication,
  ApprovalStatus,
  ClientState,
  RoomTransport,
} from '@/domain/transport'
import { ACCOUNT_PASSWORD_MIN, ACCOUNT_PASSWORD_MAX, authenticationError } from '@/domain/auth'

type Session = { id: string; code: string; uid: string }
type DirectoryEntry = Omit<Session, 'uid'> & { name?: string; salt: string; createdAt: number }
type FirebaseMessage = { id: string; uid: string; role: Role; text: string; sentAt: number }
type Activity = { uid: string; role: Role; sentAt: number; type: RoomEvent['type'] }
type AccountProfile = { role: Role; email?: string; createdAt: number; emailVerified?: boolean }
type AccountAccess = { status: 'approved' | 'rejected'; reviewedAt: number; reviewedBy: string }
type RoomData = {
  meta: {
    owner: string
    code: string
    name?: string
    createdAt: number
    salt: string
    verifier: string
    ownerSlot?: string
  }
  members: Record<string, { role: Role; proof: string }>
  seats?: Partial<Record<Role, { uid: string; connectionId: string }>>
  connections?: Record<string, Record<string, { role: Role }>>
  events?: Record<string, { joined?: Activity; left?: Activity }>
  messages?: Record<string, FirebaseMessage>
}
const SESSION_KEY = 'eh:firebase-room:v2'
const SERVER_TIME = { '.sv': 'timestamp' }
const PAGE_SIZE = 100

function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as Session | null
    return value &&
      typeof value.uid === 'string' &&
      /^[a-zA-Z0-9-]{20,64}$/.test(value.id) &&
      /^\d{6}$/.test(value.code)
      ? value
      : null
  } catch {
    return null
  }
}
const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

export async function derivePasswordProof(password: string, salt: string) {
  if (!password || password.length > 128) throw new Error('비밀번호를 1~128자로 입력해 주세요.')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 210_000, hash: 'SHA-256' },
    key,
    256,
  )
  return hex(new Uint8Array(bits))
}

class DatabaseRequestError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? '방이 종료되었거나 입장 권한을 확인하지 못했습니다.'
        : '서버 응답을 확인하지 못했습니다. 연결 후 다시 시도해 주세요.',
    )
  }
}

/** Firebase is the only service backend. REST mutations do not queue offline writes. */
export class FirebaseRoomClient implements RoomTransport {
  private auth: Auth
  private db: Database
  private state: ClientState = {
    account: null,
    profileReady: false,
    profileError: '',
    accessReady: false,
    accessError: '',
    authReady: false,
    authError: '',
    persistentLogin: true,
    connection: 'connecting',
    rooms: [],
    room: null,
    membership: null,
    pending: [],
    notice: '',
    hasEarlier: false,
    loadingEarlier: false,
  }
  private listeners = new Set<() => void>()
  private online = false
  private session = readSession()
  private roomUnsubscribe?: Unsubscribe
  private directoryUnsubscribe?: Unsubscribe
  private subscriptions: Unsubscribe[] = []
  private presence?: {
    path: string
    id: string
    operation: Pick<OnDisconnect, 'cancel'>
    departure: Record<string, unknown>
  }
  private presenceTask: Promise<void> | null = null
  private generation = 0
  private started = false
  private directory = new Map<string, DirectoryEntry>()
  private mutationInProgress = false
  private authEpoch = 0
  private accountUser: User | null = null
  private registeringAccount = false
  private stopChat?: () => void
  private startChat?: () => void
  private earlierPage?: () => Promise<void>
  private lastMessageAt = 0

  constructor(
    private readonly options: FirebaseOptions,
    private readonly emulator: boolean,
  ) {
    const app = initializeApp(options)
    let persistentLogin = true
    try {
      const probe = `eh:auth-storage-check:${crypto.randomUUID()}`
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
    } catch {
      persistentLogin = false
    }
    // Choose persistence at initialization so cross-tab listeners are attached
    // to the same storage that holds the account for the lifetime of this client.
    this.auth = initializeAuth(app, {
      persistence: persistentLogin ? browserLocalPersistence : inMemoryPersistence,
    })
    this.state.persistentLogin = persistentLogin
    this.auth.languageCode = 'ko'
    this.db = getDatabase(app)
    if (emulator) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      connectDatabaseEmulator(this.db, '127.0.0.1', 9000)
    }
    goOffline(this.db)
  }
  getSnapshot = () => this.state
  subscribe = (callback: () => void) => {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  async start() {
    if (this.started) return
    this.started = true
    this.update({ authReady: false, authError: '' })
    try {
      await this.auth.authStateReady()
      // Anonymous records remain on the server; this browser starts the new login flow.
      if (this.auth.currentUser?.isAnonymous) await signOut(this.auth)
      try {
        sessionStorage.removeItem('eh:firebase-room:v1')
      } catch {
        /* Optional legacy room hint. */
      }
      beforeAuthStateChanged(this.auth, (next) => {
        if (this.auth.currentUser?.uid !== next?.uid) this.disconnectAccount()
      })
      onAuthStateChanged(this.auth, (user) => this.connectAccount(user))
      const resume = () => {
        if (this.state.account && !this.online && document.visibilityState === 'visible')
          goOnline(this.db)
      }
      window.addEventListener('online', resume)
      document.addEventListener('visibilitychange', resume)
    } catch {
      this.started = false
      this.update({
        authReady: true,
        authError: '로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.',
      })
    }
  }

  private disconnectAccount() {
    // Close this tab's socket so its queued disconnect cleanup releases its seat.
    const previousUser = this.accountUser
    const presence = this.presence
    this.accountUser = null
    this.authEpoch++
    this.roomUnsubscribe?.()
    this.roomUnsubscribe = undefined
    this.directoryUnsubscribe?.()
    this.directoryUnsubscribe = undefined
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions = []
    goOffline(this.db)
    this.online = false
    this.resetRoom('')
    // Cross-tab auth changes can reach the database before this callback. In that
    // case onDisconnect may no longer have auth. Finish only our old connection's
    // cleanup with its original credential; never use the newly signed-in account.
    if (previousUser && presence) this.releaseOldPresence(previousUser, presence)
    this.directory.clear()
    this.update({
      account: null,
      profileReady: false,
      profileError: '',
      accessReady: false,
      accessError: '',
      rooms: [],
      connection: 'connected',
    })
  }

  private connectAccount(user: User | null) {
    if (!user || user.isAnonymous) {
      this.disconnectAccount()
      this.update({ authReady: true, authError: '' })
      return
    }
    if (this.state.account?.uid === user.uid) return
    // Firebase skips beforeAuthStateChanged for changes coming from another tab.
    if (this.state.account) this.disconnectAccount()
    this.accountUser = user
    this.update({
      account: {
        uid: user.uid,
        email: user.email || '',
        role: null,
        approval: 'pending',
        isAdmin: false,
        emailVerified: user.emailVerified,
      },
      profileReady: false,
      profileError: '',
      accessReady: false,
      accessError: '',
      authReady: true,
      authError: '',
      connection: 'connecting',
    })
    if (this.session?.uid !== user.uid) this.resetRoom('')
    const epoch = this.authEpoch
    this.subscriptions.push(
      onValue(ref(this.db, '.info/connected'), (snapshot) => {
        if (epoch !== this.authEpoch) return
        this.online = snapshot.val() === true
        if (!this.online) {
          this.generation++
          this.stopChat?.()
          this.presence = undefined
          this.presenceTask = null
          this.update({
            connection: 'disconnected',
            pending: this.state.pending.map((message) => ({ ...message, state: 'uncertain' })),
          })
        } else if (this.session && this.state.room) void this.ensurePresence()
        else if (!this.session) this.update({ connection: 'connected' })
      }),
    )
    let accessLoaded = false
    let adminLoaded = false
    const accessFailed = () => {
      if (epoch !== this.authEpoch || !this.state.account) return
      this.update({
        account: { ...this.state.account, approval: 'pending', isAdmin: false },
        accessReady: false,
        accessError: '이용 권한을 확인하지 못했습니다. 다시 로그인해 주세요.',
      })
      this.syncRoomAccess(epoch)
    }
    this.subscriptions.push(
      onValue(
        ref(this.db, `access/${user.uid}`),
        (snapshot) => {
          if (epoch !== this.authEpoch || !this.state.account) return
          const value = snapshot.val() as AccountAccess | null
          const approval: ApprovalStatus =
            value?.status === 'approved' || value?.status === 'rejected' ? value.status : 'pending'
          accessLoaded = true
          this.update({
            account: { ...this.state.account, approval },
            accessReady: adminLoaded,
            accessError: '',
          })
          this.syncRoomAccess(epoch)
        },
        accessFailed,
      ),
      onValue(
        ref(this.db, `administrators/${user.uid}`),
        (snapshot) => {
          if (epoch !== this.authEpoch || !this.state.account) return
          adminLoaded = true
          this.update({
            account: { ...this.state.account, isAdmin: snapshot.val() === true },
            accessReady: accessLoaded,
            accessError: '',
          })
          this.syncRoomAccess(epoch)
        },
        accessFailed,
      ),
    )
    this.subscriptions.push(
      onValue(
        ref(this.db, `profiles/${user.uid}`),
        (snapshot) => {
          if (epoch !== this.authEpoch || !this.state.account) return
          const value = snapshot.val() as AccountProfile | null
          const role = value?.role === 'broadcast' || value?.role === 'leader' ? value.role : null
          if (this.state.account.role && this.state.account.role !== role)
            this.releaseRoomAccess('계정 역할이 변경되었습니다. 다시 입장해 주세요.')
          this.update({
            account: { ...this.state.account, role },
            profileReady: !!role || !this.registeringAccount,
            profileError: '',
          })
          this.syncRoomAccess(epoch)
          if (user.emailVerified && value && value.emailVerified !== true)
            void this.rest(`profiles/${user.uid}/emailVerified`, 'PUT', true).catch(() => {})
          // Existing accounts add only their authenticated email; their role stays fixed.
          if (role && !value?.email && user.email)
            void this.rest(`profiles/${user.uid}/email`, 'PUT', user.email).catch(() => {})
        },
        () => {
          if (epoch === this.authEpoch) {
            this.update({
              profileReady: false,
              profileError: '계정 역할을 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.',
            })
            this.syncRoomAccess(epoch)
          }
        },
      ),
    )
    goOnline(this.db)
  }

  private watchDirectory(epoch: number) {
    this.directoryUnsubscribe = onValue(
      ref(this.db, 'directory'),
      (snapshot) => {
        if (epoch !== this.authEpoch) return
        const entries = (snapshot.val() || {}) as Record<string, DirectoryEntry>
        this.directory = new Map(Object.values(entries).map((entry) => [entry.code, entry]))
        this.update({
          rooms: [...this.directory.values()]
            .map(({ code, name, createdAt }) => ({
              code,
              name: name || `대화방 ${code}`,
              createdAt,
            }))
            .sort((a, b) => b.createdAt - a.createdAt),
        })
      },
      () => {
        if (epoch === this.authEpoch)
          this.update({
            notice: '방 목록을 가져오지 못했습니다. 연결 설정을 확인해 주세요.',
            connection: 'disconnected',
          })
      },
    )
  }

  private syncRoomAccess(epoch: number) {
    if (
      this.state.account?.emailVerified &&
      this.state.profileReady &&
      this.state.accessReady &&
      (this.state.account?.isAdmin || this.state.account?.role) &&
      this.state.account.approval === 'approved'
    ) {
      if (this.state.membership && !this.canUseRole(this.state.membership.role))
        this.releaseRoomAccess('이 계정으로 사용할 수 없는 역할입니다. 다시 입장해 주세요.')
      if (!this.directoryUnsubscribe) this.watchDirectory(epoch)
      if (this.session && !this.roomUnsubscribe) this.watchRoom(this.session)
    } else {
      this.directoryUnsubscribe?.()
      this.directoryUnsubscribe = undefined
      this.directory.clear()
      this.update({ rooms: [] })
      // Preserve a reload hint while initial permissions are still loading.
      if (
        this.state.room ||
        (this.state.accessReady && this.state.account?.approval !== 'approved')
      )
        this.releaseRoomAccess('관리자의 이용 승인이 필요합니다.')
    }
  }

  private canUseRole(role: Role | null | undefined) {
    return (
      (role === 'broadcast' || role === 'leader') &&
      !!this.state.account &&
      (this.state.account.isAdmin || this.state.account.role === role)
    )
  }

  private releaseRoomAccess(notice: string) {
    const presence = this.presence
    const user = this.accountUser
    // Keep disconnect cleanup registered until an explicit departure is confirmed.
    this.presence = undefined
    this.resetRoom(notice)
    if (presence && user)
      void this.rest('', 'PATCH', presence.departure, user)
        .catch(() => this.rest(presence.path, 'DELETE', undefined, user))
        .then(() => presence.operation.cancel())
        .catch(() => {})
  }

  watchPresets(
    role: Role,
    onChange: (collection: PresetCollection) => void,
    onError: (message: string) => void,
  ) {
    const account = this.state.account
    const epoch = this.authEpoch
    if (!account || account.approval !== 'approved' || !this.canUseRole(role)) {
      onError('이 계정으로 사용할 수 없는 문구입니다.')
      return () => {}
    }
    const unsubscribe = onValue(
      ref(this.db, `presets/${account.uid}/${role}`),
      (snapshot) => {
        if (epoch !== this.authEpoch) return
        try {
          onChange(parsePresetCollection(snapshot.val(), role))
        } catch (error) {
          onError(error instanceof Error ? error.message : '문구를 읽지 못했습니다.')
        }
      },
      () => {
        if (epoch === this.authEpoch)
          onError('문구를 불러오지 못했습니다. 연결과 이용 권한을 확인해 주세요.')
      },
    )
    // Account changes detach even if the component has not unmounted yet.
    const stop = () => {
      unsubscribe()
      this.subscriptions = this.subscriptions.filter((entry) => entry !== stop)
    }
    this.subscriptions.push(stop)
    return stop
  }

  async savePresets(role: Role, items: Preset[], revision: number) {
    const account = this.state.account
    const epoch = this.authEpoch
    if (!account || account.approval !== 'approved' || !this.canUseRole(role))
      throw new Error('이 계정으로 사용할 수 없는 문구입니다.')
    if (!this.online) throw new Error('인터넷에 연결한 뒤 저장해 주세요.')
    if (!validPresets(items) || !Number.isSafeInteger(revision) || revision < 0)
      throw new Error('문구를 확인해 주세요.')
    const path = `presets/${account.uid}/${role}`
    const next = { revision: revision + 1, items: items.map(({ id, text }) => ({ id, text })) }
    try {
      // Rules require revision + 1, so two devices cannot silently overwrite each other.
      await this.rest(path, 'PUT', next)
    } catch (error) {
      if (epoch !== this.authEpoch) throw new Error('계정이 변경되었습니다. 다시 로그인해 주세요.')
      const current = await this.rest<unknown>(path, 'GET')
        .then((value) => parsePresetCollection(value, role))
        .catch(() => null)
      // A lost response may follow a successful write. Confirm our exact result before retrying.
      if (
        current?.revision === next.revision &&
        JSON.stringify(current.items) === JSON.stringify(next.items)
      )
        return
      if (current && current.revision !== revision)
        throw new Error(
          '다른 기기에서 문구가 변경되었습니다. 편집창을 다시 열어 최신 문구를 확인해 주세요.',
        )
      if (error instanceof DatabaseRequestError)
        throw new Error('저장하지 못했습니다. 이용 권한과 문구를 확인해 주세요.')
      throw error
    }
    if (epoch !== this.authEpoch) throw new Error('계정이 변경되었습니다. 다시 로그인해 주세요.')
  }

  watchApplications(
    onChange: (applications: AccountApplication[]) => void,
    onError: (message: string) => void,
  ) {
    if (!this.state.account?.isAdmin) {
      onError('관리자 계정만 가입 신청을 확인할 수 있습니다.')
      return () => {}
    }
    const epoch = this.authEpoch
    let profiles: Record<string, AccountProfile> | null = null
    let access: Record<string, AccountAccess> | null = null
    const publish = () => {
      if (epoch !== this.authEpoch || !this.state.account?.isAdmin || !profiles || !access) return
      onChange(
        Object.entries(profiles)
          .filter(([, profile]) => profile.role === 'broadcast' || profile.role === 'leader')
          .map<AccountApplication>(([uid, profile]) => ({
            uid,
            email: profile.email || '다음 로그인에서 이메일이 표시됩니다.',
            role: profile.role,
            createdAt: profile.createdAt,
            emailVerified: profile.emailVerified === true,
            status:
              access![uid]?.status === 'approved' || access![uid]?.status === 'rejected'
                ? access![uid].status
                : 'pending',
          }))
          .sort((a, b) => b.createdAt - a.createdAt),
      )
    }
    const failed = () =>
      onError('가입 신청을 가져오지 못했습니다. 연결과 관리자 권한을 확인해 주세요.')
    const unsubscribeProfiles = onValue(
      ref(this.db, 'profiles'),
      (snapshot) => {
        profiles = snapshot.val() || {}
        publish()
      },
      failed,
    )
    const unsubscribeAccess = onValue(
      ref(this.db, 'access'),
      (snapshot) => {
        access = snapshot.val() || {}
        publish()
      },
      failed,
    )
    return () => {
      unsubscribeProfiles()
      unsubscribeAccess()
    }
  }

  async reviewApplication(uid: string, status: 'approved' | 'rejected') {
    if (!this.state.account?.isAdmin || !this.state.accessReady)
      throw new Error('관리자 계정만 승인할 수 있습니다.')
    if (uid === this.state.account.uid) throw new Error('자신의 이용 권한은 변경할 수 없습니다.')
    if (!this.online) throw new Error('연결을 확인하고 다시 시도해 주세요.')
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !['approved', 'rejected'].includes(status))
      throw new Error('가입 신청을 다시 확인해 주세요.')
    await this.rest(`access/${uid}`, 'PUT', {
      status,
      reviewedAt: SERVER_TIME,
      reviewedBy: this.state.account.uid,
    })
  }

  async signIn(email: string, password: string) {
    if (!this.state.authReady || this.state.authError)
      throw new Error('로그인 준비가 끝난 뒤 다시 시도해 주세요.')
    try {
      await signInWithEmailAndPassword(this.auth, email.trim(), password)
    } catch (error) {
      throw new Error(authenticationError(error))
    }
  }

  async sendVerification() {
    const user = this.auth.currentUser
    if (!user) throw new Error('로그인한 뒤 다시 시도해 주세요.')
    try {
      await sendEmailVerification(user)
    } catch (error) {
      throw new Error(authenticationError(error))
    }
  }

  async refreshVerification() {
    const user = this.auth.currentUser
    if (!user) throw new Error('다시 로그인해 주세요.')
    await reload(user)
    await user.getIdToken(true)
    if (!user.emailVerified)
      throw new Error('아직 인증이 확인되지 않았습니다. 메일의 링크를 먼저 눌러 주세요.')
    const profile = await this.rest<AccountProfile | null>(`profiles/${user.uid}`, 'GET')
    if (profile && profile.emailVerified !== true)
      await this.rest(`profiles/${user.uid}/emailVerified`, 'PUT', true)
    this.disconnectAccount()
    this.connectAccount(user)
  }

  async signUp(email: string, password: string, role: Role) {
    if (!this.state.authReady || this.state.authError)
      throw new Error('로그인 준비가 끝난 뒤 다시 시도해 주세요.')
    if (
      password.length < ACCOUNT_PASSWORD_MIN ||
      password.length > ACCOUNT_PASSWORD_MAX ||
      !password.trim()
    )
      throw new Error(
        `비밀번호는 ${ACCOUNT_PASSWORD_MIN}~${ACCOUNT_PASSWORD_MAX}자로 입력해 주세요.`,
      )
    if (role !== 'broadcast' && role !== 'leader') throw new Error('사용할 역할을 선택해 주세요.')
    this.registeringAccount = true
    try {
      await createUserWithEmailAndPassword(this.auth, email.trim(), password)
    } catch (error) {
      this.registeringAccount = false
      throw new Error(authenticationError(error))
    }
    try {
      await this.registerRole(role)
    } finally {
      this.registeringAccount = false
      this.update({ profileReady: true })
    }
  }

  async registerRole(role: Role) {
    const uid = this.auth.currentUser?.uid
    if (!uid) throw new Error('로그인한 뒤 다시 시도해 주세요.')
    if (role !== 'broadcast' && role !== 'leader') throw new Error('사용할 역할을 선택해 주세요.')
    this.update({ profileError: '' })
    try {
      await this.rest(`profiles/${uid}`, 'PUT', {
        role,
        email: this.auth.currentUser!.email,
        emailVerified: this.auth.currentUser!.emailVerified,
        createdAt: SERVER_TIME,
      })
    } catch {
      const saved = await this.rest<{ role: Role } | null>(`profiles/${uid}`, 'GET').catch(
        () => null,
      )
      if (saved?.role === role) return
      const message = '역할을 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
      this.update({ profileError: message })
      throw new Error(message)
    }
  }

  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(this.auth, email.trim())
    } catch (error) {
      // Match the same confirmation whether or not the address is registered.
      if ((error as { code?: string }).code !== 'auth/user-not-found')
        throw new Error(authenticationError(error))
    }
  }

  async signOut() {
    if (this.session) await this.request({ type: 'leave' })
    try {
      await signOut(this.auth)
    } catch (error) {
      throw new Error(authenticationError(error))
    }
  }

  private async rest<T>(
    path: string,
    method: 'GET' | 'PUT' | 'PATCH' | 'DELETE',
    body?: unknown,
    cleanupUser?: User,
  ): Promise<T> {
    const user = cleanupUser ?? this.auth.currentUser
    if (!user || user.isAnonymous) throw new Error('로그인한 뒤 다시 시도해 주세요.')
    const token = await user.getIdToken()
    if (!cleanupUser && this.auth.currentUser?.uid !== user.uid)
      throw new Error('계정이 변경되었습니다. 다시 시도해 주세요.')
    const endpoint = this.emulator ? 'http://127.0.0.1:9000' : this.options.databaseURL!
    const url = new URL(`${endpoint.replace(/\/$/, '')}/${path}.json`)
    if (this.emulator) url.searchParams.set('ns', `${this.options.projectId}-default-rtdb`)
    url.searchParams.set('auth', token)
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    }).catch(() => {
      throw new Error('연결이 불안정해 전송 여부를 확인하지 못했습니다. 다시 시도해 주세요.')
    })
    if (!response.ok) throw new DatabaseRequestError(response.status)
    return response.json() as Promise<T>
  }

  private releaseOldPresence(
    user: User,
    presence: { path: string; departure: Record<string, unknown> },
  ) {
    void this.rest('', 'PATCH', presence.departure, user)
      // onDisconnect may already have written the immutable departure event.
      .catch(() => this.rest(presence.path, 'DELETE', undefined, user))
      .catch(() => {})
  }

  async request(command: ClientCommand): Promise<void> {
    if (!this.state.account) throw new Error('로그인한 뒤 다시 시도해 주세요.')
    if (!this.state.account.isAdmin && !this.state.account.role && command.type !== 'leave')
      throw new Error('계정 역할을 먼저 설정해 주세요.')
    if (
      (!this.state.accessReady ||
        !this.state.account.emailVerified ||
        this.state.account.approval !== 'approved') &&
      command.type !== 'leave'
    )
      throw new Error('관리자의 이용 승인이 필요합니다.')
    if (!this.online && command.type !== 'leave')
      throw new Error('연결을 확인한 뒤 다시 시도해 주세요.')
    if (this.mutationInProgress) throw new Error('이전 요청을 처리하고 있습니다.')
    this.mutationInProgress = true
    try {
      switch (command.type) {
        case 'create':
          await this.create(command.name, command.password)
          break
        case 'join':
          await this.join(command.code, command.password, command.role)
          break
        case 'leave':
          await this.leave()
          break
        case 'close':
          await this.closeRoom()
          break
        case 'send':
          await this.sendMessage(command.text, command.messageId)
          break
        default:
          throw new Error('방 목록에서 다시 입장해 주세요.')
      }
    } finally {
      this.mutationInProgress = false
    }
  }

  private async create(name: string, password: string) {
    if (!this.canUseRole('broadcast')) throw new Error('방송실 계정만 방을 만들 수 있습니다.')
    if (this.session) throw new Error('현재 방에서 나간 뒤 새 방을 만들어 주세요.')
    name = name.trim()
    if (!name || name.length > ROOM_NAME_MAX)
      throw new Error(`방 이름은 1~${ROOM_NAME_MAX}자로 입력해 주세요.`)
    const uid = this.auth.currentUser!.uid
    const epoch = this.authEpoch
    const slots = await this.rest<Record<string, string> | null>(`ownedRooms/${uid}`, 'GET')
    const ownerSlot = ['0', '1', '2'].find((slot) => !slots?.[slot])
    if (ownerSlot === undefined)
      throw new Error(
        '계정당 방은 최대 3개까지 유지할 수 있습니다. 사용하지 않는 방을 닫은 뒤 만들어 주세요.',
      )
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
    const proof = await derivePasswordProof(password, salt)
    if (epoch !== this.authEpoch) throw new Error('계정이 변경되었습니다. 다시 시도해 주세요.')
    const id = crypto.randomUUID()
    let code: string
    do {
      code = (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, '0')
    } while (this.directory.has(code))
    const session = { id, code, uid }
    try {
      await this.rest('', 'PATCH', {
        [`rooms/${id}`]: {
          meta: {
            owner: uid,
            ownerSlot,
            code,
            name,
            createdAt: SERVER_TIME,
            salt,
            verifier: proof,
          },
          members: { [uid]: { role: 'broadcast', proof } },
        },
        [`directory/${code}`]: { id, code, name, createdAt: SERVER_TIME, salt },
        [`ownedRooms/${uid}/${ownerSlot}`]: id,
      })
    } catch (error) {
      // A lost HTTP response can still have committed. Never repeat CREATE.
      try {
        const existing = await this.rest<RoomData['meta'] | null>(`rooms/${id}/meta`, 'GET')
        if (!existing || existing.owner !== uid) throw error
      } catch {
        throw error
      }
    }
    if (epoch === this.authEpoch) this.watchRoom(session)
  }

  private async admissionConflict(session: Pick<Session, 'id' | 'uid'>, role: Role) {
    // Existing members can check their own connection even when a role change was rejected.
    // A new visitor cannot read these paths until the password has been accepted.
    const ownConnections = await this.rest<Record<string, { role: Role }> | null>(
      `rooms/${session.id}/connections/${session.uid}`,
      'GET',
    )
    if (ownConnections && Object.keys(ownConnections).length > 0)
      return '이 계정은 현재 다른 기기나 탭에서 이 방에 참여 중입니다. 기존 접속에서 나간 뒤 입장해 주세요.'
    const seat = await this.rest<{ uid: string; connectionId: string } | null>(
      `rooms/${session.id}/seats/${role}`,
      'GET',
    )
    if (
      seat &&
      (await this.rest(`rooms/${session.id}/connections/${seat.uid}/${seat.connectionId}`, 'GET'))
    )
      return seat.uid === session.uid
        ? '이 계정은 현재 다른 기기나 탭에서 이 방에 참여 중입니다. 기존 접속에서 나간 뒤 입장해 주세요.'
        : `다른 사용자가 ${ROLE_NAMES[role]} 역할로 이 방에 참여 중입니다. 해당 사용자가 나간 뒤 입장해 주세요.`
    return ''
  }

  private async join(code: string, password: string, role: Role) {
    if (!this.canUseRole(role)) throw new Error('가입한 계정의 역할로만 입장할 수 있습니다.')
    const epoch = this.authEpoch
    const uid = this.auth.currentUser!.uid
    if (this.session) throw new Error('현재 방에서 나간 뒤 입장해 주세요.')
    const entry = this.directory.get(code)
    if (!entry) throw new Error('이미 종료된 방입니다. 방 목록을 다시 확인해 주세요.')
    const proof = await derivePasswordProof(password, entry.salt)
    if (epoch !== this.authEpoch) throw new Error('계정이 변경되었습니다. 다시 시도해 주세요.')
    try {
      await this.rest(`rooms/${entry.id}/members/${uid}`, 'PUT', {
        role,
        proof,
      })
    } catch (error) {
      if (error instanceof DatabaseRequestError && [401, 403].includes(error.status)) {
        const conflict = await this.admissionConflict({ id: entry.id, uid }, role).catch(() => '')
        if (epoch !== this.authEpoch) throw new Error('계정이 변경되었습니다. 다시 시도해 주세요.')
        if (conflict) throw new Error(conflict)
        throw new Error('방이 종료되었거나 비밀번호가 맞지 않습니다.')
      }
      throw error
    }
    const conflict = await this.admissionConflict({ id: entry.id, uid }, role)
    if (conflict) throw new Error(conflict)
    if (epoch === this.authEpoch) this.watchRoom({ id: entry.id, code, uid })
  }

  private watchRoom(session: Session) {
    if (
      session.uid !== this.state.account?.uid ||
      !this.state.account.emailVerified ||
      this.state.account.approval !== 'approved' ||
      !this.state.accessReady
    )
      return
    const epoch = this.authEpoch
    this.generation++
    this.roomUnsubscribe?.()
    this.session = session
    this.update({
      connection: 'connecting',
      notice: '',
      pending: [],
      room: null,
      membership: null,
      hasEarlier: false,
      loadingEarlier: false,
    })
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      /* Optional. */
    }
    let disposed = false
    let meta: RoomData['meta'] | null | undefined
    let member: RoomData['members'][string] | null | undefined
    let seats: RoomData['seats'] = {}
    let connections: RoomData['connections'] = {}
    let messages: Record<string, FirebaseMessage> = {}
    let events: NonNullable<RoomData['events']> = {}
    let messageCursor: { key: string; time: number } | null = null
    let eventCursor: { key: string; time: number } | null = null
    let moreMessages = false,
      moreEvents = false
    let streaming = false
    let streamVersion = 0
    let streamStops: Unsubscribe[] = []
    const valid = () => !disposed && epoch === this.authEpoch && this.session?.id === session.id
    const publish = () => {
      if (!valid() || !meta || !member) return
      if (!this.canUseRole(member.role)) {
        this.releaseRoomAccess('다시 비밀번호로 입장해 주세요.')
        return
      }
      const participants = { broadcast: 0, leader: 0 }
      for (const role of ['broadcast', 'leader'] as const) {
        const seat = seats?.[role]
        participants[role] = seat && connections?.[seat.uid]?.[seat.connectionId] ? 1 : 0
      }
      const chat = Object.values(messages)
        .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))
        .map(({ uid: _uid, ...message }, index) => ({ ...message, sequence: index + 1 }))
      const activity: RoomEvent[] = Object.entries(events).flatMap(([id, event]) =>
        !event.joined
          ? []
          : [event.joined, ...(event.left ? [event.left] : [])].map((item) => ({
              id: `${id}:${item.type}`,
              role: item.role,
              type: item.type,
              sentAt: item.sentAt,
            })),
      )
      this.update({
        room: {
          code: meta.code,
          name: meta.name || `대화방 ${meta.code}`,
          createdAt: meta.createdAt,
          participants,
          messages: chat,
          events: activity,
        },
        membership: {
          code: meta.code,
          role: member.role,
          token: '',
          canClose: member.role === 'broadcast' && meta.owner === session.uid,
        },
        pending: this.state.pending.filter((item) => !messages[item.id]),
        hasEarlier: moreMessages || moreEvents,
      })
      if (this.online) void this.ensurePresence()
    }
    const stopStreams = () => {
      streamVersion++
      streamStops.forEach((stop) => stop())
      streamStops = []
      streaming = false
    }
    const accessEnded = async () => {
      if (!valid()) return
      // Closing a room revokes child subscriptions before their null snapshots arrive.
      const missing = await this.rest<RoomData['meta'] | null>(`rooms/${session.id}/meta`, 'GET')
        .then((value) => value === null)
        .catch(() => false)
      if (!valid()) return
      if (missing) this.resetRoom('방이 종료되었습니다. 대화가 삭제되었습니다.')
      else this.releaseRoomAccess('이용 권한을 확인한 뒤 다시 입장해 주세요.')
    }
    const startStreams = () => {
      if (!valid() || streaming || !this.presence || !this.online) return
      streaming = true
      const version = ++streamVersion
      messages = {}
      events = {}
      messageCursor = null
      eventCursor = null
      moreMessages = false
      moreEvents = false
      const failed = () => {
        if (!valid() || version !== streamVersion) return
        stopStreams()
        if (this.online && this.presence) void accessEnded()
      }
      streamStops.push(
        onValue(
          query(
            ref(this.db, `rooms/${session.id}/messages`),
            orderByChild('sentAt'),
            limitToLast(PAGE_SIZE),
          ),
          (snapshot) => {
            if (!valid() || version !== streamVersion) return
            const value = (snapshot.val() || {}) as Record<string, FirebaseMessage>
            const ordered = Object.entries(value).sort(
              (a, b) => a[1].sentAt - b[1].sentAt || a[0].localeCompare(b[0]),
            )
            if (!messageCursor && ordered.length) {
              messageCursor = { key: ordered[0][0], time: ordered[0][1].sentAt }
              moreMessages = ordered.length === PAGE_SIZE
            }
            Object.assign(messages, value)
            publish()
          },
          failed,
        ),
      )
      streamStops.push(
        onValue(
          query(
            ref(this.db, `rooms/${session.id}/events`),
            orderByChild('joined/sentAt'),
            limitToLast(PAGE_SIZE),
          ),
          (snapshot) => {
            if (!valid() || version !== streamVersion) return
            const value = (snapshot.val() || {}) as NonNullable<RoomData['events']>
            const ordered = Object.entries(value)
              .filter(([, v]) => v.joined)
              .sort((a, b) => a[1].joined!.sentAt - b[1].joined!.sentAt || a[0].localeCompare(b[0]))
            if (!eventCursor && ordered.length) {
              eventCursor = { key: ordered[0][0], time: ordered[0][1].joined!.sentAt }
              moreEvents = ordered.length === PAGE_SIZE
            }
            Object.assign(events, value)
            publish()
          },
          failed,
        ),
      )
    }
    this.stopChat = stopStreams
    this.startChat = startStreams
    this.earlierPage = async () => {
      if (!valid() || !streaming || !this.online || this.state.loadingEarlier) return
      const version = streamVersion
      this.update({ loadingEarlier: true })
      try {
        if (moreMessages && messageCursor) {
          const snapshot = await get(
            query(
              ref(this.db, `rooms/${session.id}/messages`),
              orderByChild('sentAt'),
              endBefore(messageCursor.time, messageCursor.key),
              limitToLast(PAGE_SIZE),
            ),
          )
          if (!valid() || version !== streamVersion) return
          const value = (snapshot.val() || {}) as Record<string, FirebaseMessage>
          const ordered = Object.entries(value).sort(
            (a, b) => a[1].sentAt - b[1].sentAt || a[0].localeCompare(b[0]),
          )
          Object.assign(messages, value)
          moreMessages = ordered.length === PAGE_SIZE
          if (ordered.length) messageCursor = { key: ordered[0][0], time: ordered[0][1].sentAt }
        }
        if (moreEvents && eventCursor) {
          const snapshot = await get(
            query(
              ref(this.db, `rooms/${session.id}/events`),
              orderByChild('joined/sentAt'),
              endBefore(eventCursor.time, eventCursor.key),
              limitToLast(PAGE_SIZE),
            ),
          )
          if (!valid() || version !== streamVersion) return
          const value = (snapshot.val() || {}) as NonNullable<RoomData['events']>
          const ordered = Object.entries(value)
            .filter(([, v]) => v.joined)
            .sort((a, b) => a[1].joined!.sentAt - b[1].joined!.sentAt || a[0].localeCompare(b[0]))
          Object.assign(events, value)
          moreEvents = ordered.length === PAGE_SIZE
          if (ordered.length)
            eventCursor = { key: ordered[0][0], time: ordered[0][1].joined!.sentAt }
        }
        publish()
      } finally {
        if (valid()) this.update({ loadingEarlier: false })
      }
    }
    const controlFailed = () => {
      void accessEnded()
    }
    const controls = [
      onValue(
        ref(this.db, `rooms/${session.id}/meta`),
        (snapshot) => {
          if (!valid()) return
          meta = snapshot.val()
          if (!meta) {
            this.resetRoom('방이 종료되었습니다. 대화가 삭제되었습니다.')
            return
          }
          publish()
        },
        controlFailed,
      ),
      onValue(
        ref(this.db, `rooms/${session.id}/members/${session.uid}`),
        (snapshot) => {
          if (!valid()) return
          member = snapshot.val()
          publish()
        },
        controlFailed,
      ),
      onValue(
        ref(this.db, `rooms/${session.id}/seats`),
        (snapshot) => {
          if (!valid()) return
          seats = snapshot.val() || {}
          publish()
        },
        controlFailed,
      ),
      onValue(
        ref(this.db, `rooms/${session.id}/connections`),
        (snapshot) => {
          if (!valid()) return
          connections = snapshot.val() || {}
          publish()
        },
        controlFailed,
      ),
    ]
    this.roomUnsubscribe = () => {
      disposed = true
      stopStreams()
      controls.forEach((stop) => stop())
    }
  }

  async loadEarlier() {
    await this.earlierPage?.()
  }

  async closeUnusedRoom(code: string) {
    if (!this.state.account?.isAdmin || !this.state.account.emailVerified)
      throw new Error('관리자만 방을 정리할 수 있습니다.')
    const entry = this.directory.get(code)
    if (!entry) throw new Error('이미 종료된 방입니다.')
    try {
      const meta = await this.rest<RoomData['meta'] | null>(`rooms/${entry.id}/meta`, 'GET')
      const remove: Record<string, null> = {
        [`rooms/${entry.id}`]: null,
        [`directory/${code}`]: null,
      }
      if (meta?.ownerSlot !== undefined) remove[`ownedRooms/${meta.owner}/${meta.ownerSlot}`] = null
      await this.rest('', 'PATCH', remove)
    } catch (error) {
      if (error instanceof DatabaseRequestError)
        throw new Error('참여자가 있는 방은 정리할 수 없습니다. 모두 나간 뒤 다시 시도해 주세요.')
      throw error
    }
  }

  private ensurePresence(): Promise<void> {
    if (this.presenceTask) return this.presenceTask
    if (
      this.presence ||
      !this.session ||
      !this.state.membership ||
      !this.canUseRole(this.state.membership.role) ||
      !this.online ||
      !this.state.account ||
      this.state.account.approval !== 'approved' ||
      !this.state.accessReady
    )
      return Promise.resolve()
    const session = this.session
    const role = this.state.membership.role
    const generation = this.generation
    const uid = session.uid
    const user = this.accountUser!
    const id = crypto.randomUUID()
    const path = `rooms/${session.id}/connections/${uid}/${id}`
    const eventPath = `rooms/${session.id}/events/${id}`
    const activity = { uid, role, sentAt: SERVER_TIME }
    const departure = {
      [path]: null,
      [`${eventPath}/left`]: { ...activity, type: 'left' },
    }
    const connectionDisconnect = onDisconnect(ref(this.db, path))
    const activityDisconnect = onDisconnect(ref(this.db, `${eventPath}/left`))
    const operation = {
      cancel: async () => {
        await Promise.all([connectionDisconnect.cancel(), activityDisconnect.cancel()])
      },
    }
    this.presenceTask = (async () => {
      try {
        await onDisconnect(ref(this.db)).update({
          [path]: null,
          [`${eventPath}/left`]: { ...activity, type: 'disconnected' },
        })
        if (generation !== this.generation) {
          void operation.cancel()
          return
        }
        await this.rest('', 'PATCH', {
          [path]: { role },
          [`rooms/${session.id}/seats/${role}`]: { uid, connectionId: id },
          [`${eventPath}/joined`]: { ...activity, type: 'joined' },
        })
        if (generation !== this.generation) {
          // Keep queued cleanup until an explicit removal is confirmed.
          void this.rest('', 'PATCH', departure, user)
            .catch(() => this.rest(path, 'DELETE', undefined, user))
            .then(() => operation.cancel())
            .catch(() => {})
          return
        }
        this.presence = { path, id, operation, departure }
        this.update({ connection: 'connected' })
        this.startChat?.()
      } catch (error) {
        if (
          generation === this.generation &&
          error instanceof DatabaseRequestError &&
          [401, 403].includes(error.status)
        ) {
          await operation.cancel().catch(() => {})
          const conflict = await this.admissionConflict(session, role).catch(() => '')
          if (generation === this.generation)
            this.resetRoom(
              conflict ||
                '입장하지 못했습니다. 방이 열려 있는지와 이용 권한을 확인한 뒤 다시 시도해 주세요.',
            )
        } else if (generation === this.generation) {
          // A lost REST response can have committed. Keep the disconnect operation
          // registered and end this connection so an uncertain admission cannot leak a seat.
          goOffline(this.db)
          this.update({
            connection: 'disconnected',
            notice: '입장 연결을 마치지 못했습니다. 다시 연결해 주세요.',
          })
        }
      } finally {
        if (generation === this.generation) this.presenceTask = null
      }
    })()
    return this.presenceTask
  }

  private async leave() {
    const presence = this.presence
    this.stopChat?.()
    if (presence && this.online) {
      try {
        await this.rest('', 'PATCH', presence.departure)
        await presence.operation.cancel()
      } catch (error) {
        this.startChat?.()
        throw error
      }
    } else if (this.session) {
      // Terminate this SDK connection so its queued disconnect operation can release the seat.
      goOffline(this.db)
    }
    this.resetRoom('방을 유지하고 나왔습니다. 다시 입장하면 이전 대화를 볼 수 있어요.')
    goOnline(this.db)
  }

  private async closeRoom() {
    const session = this.session
    if (!session || !this.state.membership?.canClose)
      throw new Error('이 방을 만든 방송실 계정만 방을 닫을 수 있습니다.')
    const meta = await this.rest<RoomData['meta']>(`rooms/${session.id}/meta`, 'GET')
    const remove: Record<string, null> = {
      [`rooms/${session.id}`]: null,
      [`directory/${session.code}`]: null,
    }
    if (meta.ownerSlot !== undefined) remove[`ownedRooms/${meta.owner}/${meta.ownerSlot}`] = null
    await this.rest('', 'PATCH', remove)
    this.resetRoom('방이 종료되었습니다. 대화가 삭제되었습니다.')
  }

  async sendMessage(text: string, retryId?: string): Promise<void> {
    if (!this.state.accessReady || this.state.account?.approval !== 'approved')
      throw new Error('관리자의 이용 승인이 필요합니다.')
    const session = this.session
    const membership = this.state.membership
    if (membership && !this.canUseRole(membership.role))
      throw new Error('이 계정으로 사용할 수 없는 역할입니다. 다시 입장해 주세요.')
    if (!session || !membership || this.state.connection !== 'connected')
      throw new Error('연결을 확인한 뒤 다시 시도해 주세요.')
    if (!text.trim() || text.length > MAX_MESSAGE_LENGTH)
      throw new Error(`메시지는 1~${MAX_MESSAGE_LENGTH}자로 입력해 주세요.`)
    if (!retryId && Date.now() - this.lastMessageAt < 500)
      throw new Error('문구가 연속으로 눌렸습니다. 잠시 후 다시 보내 주세요.')
    this.lastMessageAt = Date.now()
    const id = retryId ?? crypto.randomUUID()
    const path = `rooms/${session.id}/messages/${id}`
    const uid = this.auth.currentUser!.uid
    this.update({
      pending: [
        ...this.state.pending.filter((message) => message.id !== id),
        { id, text, state: 'sending', code: session.code },
      ],
    })
    try {
      const prior = retryId ? await this.rest<FirebaseMessage | null>(path, 'GET') : null
      if (prior && (prior.uid !== uid || prior.text !== text))
        throw new Error('이미 사용된 메시지 번호입니다.')
      if (!prior)
        await this.rest('', 'PATCH', {
          [path]: {
            id,
            uid,
            role: membership.role,
            text,
            sentAt: SERVER_TIME,
            connectionId: this.presence?.id,
          },
          [`rooms/${session.id}/sending/${uid}`]: { sentAt: SERVER_TIME, messageId: id },
        })
      this.update({ pending: this.state.pending.filter((message) => message.id !== id) })
    } catch (error) {
      if (this.session?.id !== session.id) throw error
      if (this.state.room?.messages.some((message) => message.id === id && message.text === text))
        return
      this.update({
        pending: this.state.pending.map((message) =>
          message.id === id ? { ...message, state: 'uncertain' } : message,
        ),
      })
      throw error
    }
  }

  private resetRoom(notice: string) {
    this.generation++
    this.roomUnsubscribe?.()
    this.roomUnsubscribe = undefined
    this.stopChat = undefined
    this.startChat = undefined
    this.earlierPage = undefined
    if (this.presence && this.online) void this.presence.operation.cancel().catch(() => {})
    this.presence = undefined
    this.presenceTask = null
    this.session = null
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* Optional. */
    }
    this.update({
      membership: null,
      room: null,
      pending: [],
      notice,
      hasEarlier: false,
      loadingEarlier: false,
      connection: this.online ? 'connected' : 'disconnected',
    })
  }

  reconnect = () => {
    if (!this.started) {
      void this.start()
      return
    }
    if (!this.state.account) return
    goOffline(this.db)
    goOnline(this.db)
  }
  private update(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
}
