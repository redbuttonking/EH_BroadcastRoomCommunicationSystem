import { useEffect, useState, useSyncExternalStore } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalHeader } from '@/components/ui/modal'
import { PresetEditor } from '@/components/preset-editor'
import type { PresetCollection } from '@/domain/presets'
import type { RoomTransport } from '@/domain/transport'
import { ROLE_NAMES, type Role } from '@/domain/types'

export function useAccountPresets(client: RoomTransport, role: Role) {
  const { account } = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const [loaded, setLoaded] = useState<{
    uid: string
    role: Role
    collection: PresetCollection | null
    error: string
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const uid = account?.uid
  const allowed = account?.approval === 'approved' && (account.isAdmin || account.role === role)
  useEffect(() => {
    if (!uid || !allowed) return
    let active = true
    setLoaded(null)
    const stop = client.watchPresets(
      role,
      (collection) => active && setLoaded({ uid, role, collection, error: '' }),
      (error) => active && setLoaded({ uid, role, collection: null, error }),
    )
    return () => {
      active = false
      stop()
    }
  }, [client, uid, role, allowed, attempt])
  const current = allowed && loaded?.uid === uid && loaded?.role === role ? loaded : null
  return {
    collection: current?.collection ?? null,
    error: current?.error ?? '',
    retry: () => setAttempt((value) => value + 1),
  }
}

export function AccountPresetDialog({
  client,
  role,
  onClose,
  onSaved,
}: {
  client: RoomTransport
  role: Role
  onClose: () => void
  onSaved?: () => void
}) {
  const { collection, error, retry } = useAccountPresets(client, role)
  const [returnFocus] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      // The loading dialog is replaced by the editor; retain its original opener.
      queueMicrotask(() => {
        if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus()
      })
    },
    [returnFocus],
  )
  // Freeze the opening snapshot. Remote updates must never replace an unsaved draft.
  const [initial, setInitial] = useState<PresetCollection | null>(null)
  useEffect(() => {
    if (collection) setInitial((previous) => previous ?? collection)
  }, [collection])
  if (initial)
    return (
      <PresetEditor
        role={role}
        presets={initial.items}
        onSave={async (items) => {
          await client.savePresets(role, items, initial.revision)
          onSaved?.()
        }}
        onClose={onClose}
      />
    )
  return (
    <Modal open titleId="loading-presets-title" onDismiss={onClose}>
      <ModalHeader title="빠른 문구 편집" titleId="loading-presets-title" onDismiss={onClose} />
      <p role={error ? 'alert' : 'status'}>{error || '계정의 문구를 불러오고 있습니다…'}</p>
      {error && (
        <Button variant="outline" onClick={retry}>
          다시 불러오기
        </Button>
      )}
    </Modal>
  )
}

export function AccountPresetSettings({ client }: { client: RoomTransport }) {
  const { account } = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const [editing, setEditing] = useState<Role | null>(null)
  const [saved, setSaved] = useState(false)
  if (!account || account.approval !== 'approved') return null
  const roles: Role[] = account.isAdmin
    ? ['broadcast', 'leader']
    : account.role
      ? [account.role]
      : []
  return (
    <section className="account-presets" aria-label="내 빠른 문구">
      <div>
        <h2>내 빠른 문구</h2>
        <p>같은 계정으로 로그인하면 어느 기기에서든 사용할 수 있어요.</p>
      </div>
      <div className="account-preset-actions">
        {roles.map((role) => (
          <Button
            key={role}
            variant="outline"
            size="sm"
            onClick={() => {
              setSaved(false)
              setEditing(role)
            }}
          >
            <Pencil size={15} />
            {account.isAdmin ? `${ROLE_NAMES[role]} 문구 편집` : '빠른 문구 편집'}
          </Button>
        ))}
      </div>
      {saved && <span role="status">계정에 문구를 저장했습니다.</span>}
      {editing && roles.includes(editing) && (
        <AccountPresetDialog
          key={`${account.uid}:${editing}`}
          client={client}
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setSaved(true)}
        />
      )}
    </section>
  )
}
