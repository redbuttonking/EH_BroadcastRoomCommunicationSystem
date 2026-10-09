import type { ClientCommand, Membership, RoomSnapshot, RoomSummary, Role, Preset } from './types'
import type { PresetCollection } from './presets'

export type PendingMessage = {
  id: string
  text: string
  state: 'sending' | 'uncertain'
  code: string
}
export type ClientState = {
  account: {
    uid: string
    email: string
    role: Role | null
    approval: ApprovalStatus
    isAdmin: boolean
    emailVerified: boolean
  } | null
  profileReady: boolean
  profileError: string
  accessReady: boolean
  accessError: string
  authReady: boolean
  authError: string
  persistentLogin: boolean
  connection: 'connecting' | 'connected' | 'disconnected'
  rooms: RoomSummary[]
  room: RoomSnapshot | null
  membership: Membership | null
  pending: PendingMessage[]
  notice: string
  hasEarlier: boolean
  loadingEarlier: boolean
}
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AccountApplication = {
  uid: string
  email: string
  role: Role
  createdAt: number
  status: ApprovalStatus
  emailVerified: boolean
}
export interface RoomTransport {
  sendVerification: () => Promise<void>
  refreshVerification: () => Promise<void>
  loadEarlier: () => Promise<void>
  closeUnusedRoom: (code: string) => Promise<void>
  watchPresets: (
    role: Role,
    onChange: (collection: PresetCollection) => void,
    onError: (message: string) => void,
  ) => () => void
  savePresets: (role: Role, items: Preset[], revision: number) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, role: Role) => Promise<void>
  registerRole: (role: Role) => Promise<void>
  watchApplications: (
    onChange: (applications: AccountApplication[]) => void,
    onError: (message: string) => void,
  ) => () => void
  reviewApplication: (uid: string, status: 'approved' | 'rejected') => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
  getSnapshot: () => ClientState
  subscribe: (callback: () => void) => () => void
  reconnect: () => void
  request: (command: ClientCommand) => Promise<void>
  sendMessage: (text: string, retryId?: string) => Promise<void>
}
