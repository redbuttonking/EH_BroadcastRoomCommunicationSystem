import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { Menu, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal, ModalHeader } from '@/components/ui/modal'
import { SortablePreset } from '@/components/sortable-preset'
import { PRESET_LIMIT, readLegacyPresets, validPresets } from '@/domain/presets'
import { ROLE_NAMES, type Preset, type Role } from '@/domain/types'

export function PresetEditor({
  role,
  presets,
  onSave,
  onClose,
}: {
  role: Role
  presets: Preset[]
  onSave: (presets: Preset[]) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const continueEditing = useRef<HTMLButtonElement>(null)
  const [items, setItems] = useState(() => presets.map(({ id, text }) => ({ id, text })))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [legacy] = useState(() => {
    try {
      return readLegacyPresets(localStorage, role)
    } catch {
      return null
    }
  })
  const [imported, setImported] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [keyboardScroll, setKeyboardScroll] = useState(false)
  const [draggingScroll, setDraggingScroll] = useState(false)
  const [pulse, setPulse] = useState<{ id: string; serial: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirty =
    items.length !== presets.length ||
    items.some(
      (item, index) => item.id !== presets[index]?.id || item.text !== presets[index]?.text,
    )
  const requestClose = () => {
    if (activeId || savingRef.current) return
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'auto',
    }),
  )
  const moveTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= items.length) return
    const id = items[from].id
    setItems(arrayMove(items, from, to))
    setPulse((previous) => ({ id, serial: (previous?.serial ?? 0) + 1 }))
    setAnnouncement(`문구 ${from + 1}을 ${to + 1}번째로 이동했습니다.`)
    requestAnimationFrame(() => {
      const item = [
        ...(dialog.current?.querySelectorAll<HTMLElement>('[data-preset-id]') ?? []),
      ].find((element) => element.dataset.presetId === id)
      item?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    })
  }
  const activeItem = items.find((item) => item.id === activeId)
  return (
    <>
      <Modal
        open
        dialogRef={dialog}
        className="preset-editor"
        titleId="preset-editor-title"
        disabled={!!activeId || confirmDiscard || saving}
        onDismiss={requestClose}
      >
        <form
          aria-busy={saving}
          onSubmit={async (event) => {
            event.preventDefault()
            if (savingRef.current || activeId) return
            savingRef.current = true
            setSaving(true)
            setError('')
            try {
              const next = items.map(({ id, text }) => ({ id, text: text.trim() }))
              await onSave(next)
              onClose()
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : '저장하지 못했습니다. 다시 시도해 주세요.',
              )
            } finally {
              savingRef.current = false
              setSaving(false)
            }
          }}
        >
          <ModalHeader
            title="빠른 문구 편집"
            titleId="preset-editor-title"
            description={`${ROLE_NAMES[role]} · 내 계정에 저장됩니다.`}
            onDismiss={requestClose}
            disabled={!!activeId || saving}
          />
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  '스페이스 키로 문구를 잡고 위아래 방향키로 이동한 뒤 스페이스 키로 놓으세요. Escape 키로 이동을 취소합니다.',
              },
              announcements: {
                onDragStart: () => '문구를 잡았습니다.',
                onDragOver: ({ over }) =>
                  over
                    ? `${items.findIndex((item) => item.id === over.id) + 1}번째 위치입니다.`
                    : '문구 목록 안으로 이동해 주세요.',
                onDragEnd: () => '문구 이동을 마쳤습니다.',
                onDragCancel: () => '문구 이동을 취소했습니다.',
              },
            }}
            onDragStart={({ active }) => setActiveId(String(active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={({ active, over }) => {
              setActiveId(null)
              if (over)
                moveTo(
                  items.findIndex((item) => item.id === active.id),
                  items.findIndex((item) => item.id === over.id),
                )
            }}
          >
            <ScrollArea.Root
              className="editor-scroll"
              type="scroll"
              scrollHideDelay={800}
              inert={saving}
              onFocusCapture={(event) => {
                if (event.target.matches(':focus-visible')) setKeyboardScroll(true)
              }}
              onKeyDownCapture={() => setKeyboardScroll(true)}
              onPointerDownCapture={() => setKeyboardScroll(false)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardScroll(false)
              }}
            >
              <ScrollArea.Viewport
                className="editor-viewport"
                aria-label="편집할 문구 목록"
                tabIndex={0}
              >
                <div className="editor-list">
                  {legacy !== null && !imported && (
                    <div className="legacy-presets">
                      <p>이 브라우저에 예전에 저장한 문구가 있어요.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={dirty || !!activeId}
                        onClick={() => {
                          setItems(legacy.map((item) => ({ ...item })))
                          setImported(true)
                        }}
                      >
                        이 기기 문구 가져오기
                      </Button>
                      <span>현재 목록을 가져온 문구로 바꿉니다. 확인 후 저장해 주세요.</span>
                    </div>
                  )}
                  {items.length === 0 && <p>자주 쓰는 문구를 추가해 주세요.</p>}
                  <SortableContext
                    items={items.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((item, index) => (
                      <SortablePreset
                        key={item.id}
                        item={item}
                        index={index}
                        count={items.length}
                        pulse={pulse?.id === item.id ? pulse.serial : null}
                        update={(text) =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id ? { ...entry, text } : entry,
                            ),
                          )
                        }
                        move={(direction) => moveTo(index, index + direction)}
                        remove={() =>
                          setItems((current) => current.filter((entry) => entry.id !== item.id))
                        }
                      />
                    ))}
                  </SortableContext>
                  <Button
                    type="button"
                    variant="outline"
                    className="add-preset"
                    disabled={items.length >= PRESET_LIMIT}
                    onClick={() => {
                      setItems([...items, { id: crypto.randomUUID(), text: '' }])
                      requestAnimationFrame(() =>
                        dialog.current
                          ?.querySelector<HTMLTextAreaElement>('.editor-item:last-of-type textarea')
                          ?.focus(),
                      )
                    }}
                  >
                    <Plus size={18} />
                    문구 추가
                  </Button>
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar
                forceMount
                orientation="vertical"
                className="editor-scrollbar"
                data-pinned={keyboardScroll || draggingScroll}
                onPointerDown={() => setDraggingScroll(true)}
                onPointerUp={() => setDraggingScroll(false)}
                onPointerCancel={() => setDraggingScroll(false)}
                onLostPointerCapture={() => setDraggingScroll(false)}
              >
                <ScrollArea.Thumb className="editor-scroll-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            <DragOverlay dropAnimation={null}>
              {activeItem && (
                <div className="preset-drag-preview">
                  <span>{activeItem.text || '새 문구'}</span>
                  <Menu size={19} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
          {error && (
            <p className="error-message editor-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={!!activeId || saving}
            >
              취소
            </Button>
            <Button type="submit" disabled={!validPresets(items) || !!activeId || saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={confirmDiscard}
        onDismiss={() => setConfirmDiscard(false)}
        titleId="discard-presets-title"
        initialFocusRef={continueEditing}
      >
        <ModalHeader
          title="변경내용을 취소할까요?"
          titleId="discard-presets-title"
          onDismiss={() => setConfirmDiscard(false)}
        />
        <p>저장하지 않은 수정 내용과 문구 순서가 사라집니다.</p>
        <div className="dialog-actions">
          <Button variant="outline" ref={continueEditing} onClick={() => setConfirmDiscard(false)}>
            계속 편집하기
          </Button>
          <Button variant="destructive" onClick={onClose}>
            취소하기
          </Button>
        </div>
      </Modal>
    </>
  )
}
