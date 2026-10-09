export type Role = 'broadcast' | 'leader'
export const ROLE_NAMES: Record<Role, string> = { broadcast: '방송실', leader: '예배인도자' }

export type ChatMessage = {
  id: string
  role: Role
  text: string
  sequence: number
  sentAt: number
}

export const ROOM_NAME_MAX = 40
export const defaultRoomName = () =>
  `대화방 ${(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, '0')}`
export type RoomSummary = { code: string; name: string; createdAt: number }
export type RoomEvent = {
  id: string
  role: Role
  type: 'joined' | 'left' | 'disconnected'
  sentAt: number
}
export type RoomSnapshot = RoomSummary & {
  messages: ChatMessage[]
  events: RoomEvent[]
  participants: Record<Role, number>
}
export type Membership = { code: string; role: Role; token: string; canClose: boolean }

export type ClientCommand =
  | { type: 'create'; name: string; password: string }
  | { type: 'join'; code: string; password: string; role: Role }
  | { type: 'resume'; code: string; token: string }
  | { type: 'send'; messageId: string; text: string }
  | { type: 'leave' }
  | { type: 'close' }

export type ClientPacket = ClientCommand & { requestId: string }
export type ServerPacket =
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'entered'; membership: Membership; room: RoomSnapshot }
  | { type: 'ended'; reason: 'closed' | 'left' | 'missing' }
  | { type: 'ack'; requestId: string }
  | { type: 'error'; requestId: string; code: string; message: string }

export type Preset = { id: string; text: string }
export const MAX_MESSAGE_LENGTH = 500
