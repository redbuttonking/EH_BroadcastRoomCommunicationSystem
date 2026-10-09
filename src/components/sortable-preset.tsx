import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Menu, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PRESET_TEXT_LIMIT } from '@/domain/presets'
import type { Preset } from '@/domain/types'

export function SortablePreset({
  item,
  index,
  count,
  pulse,
  update,
  move,
  remove,
}: {
  item: Preset
  index: number
  count: number
  pulse: number | null
  update: (text: string) => void
  move: (direction: number) => void
  remove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })
  return (
    <fieldset
      ref={setNodeRef}
      data-preset-id={item.id}
      className={`editor-item ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {pulse !== null && <span key={pulse} className="reorder-pulse" aria-hidden="true" />}
      <legend className="sr-only">문구 {index + 1}</legend>
      <div className="editor-item-heading">
        <span>문구 {index + 1}</span>
        <Button
          type="button"
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon"
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`문구 ${index + 1} 드래그하여 이동`}
          title="잡아서 원하는 위치로 이동"
        >
          <Menu size={19} />
        </Button>
      </div>
      <label className="editor-text">
        <span className="sr-only">내용</span>
        <textarea
          aria-label={`문구 ${index + 1} 내용`}
          required
          rows={2}
          maxLength={PRESET_TEXT_LIMIT}
          value={item.text}
          onChange={(event) => update(event.target.value)}
        />
      </label>
      <div className="editor-item-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`문구 ${index + 1} 위로`}
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp size={18} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`문구 ${index + 1} 아래로`}
          disabled={index === count - 1}
          onClick={() => move(1)}
        >
          <ArrowDown size={18} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`문구 ${index + 1} 삭제`}
          onClick={remove}
        >
          <Trash2 size={18} />
        </Button>
      </div>
    </fieldset>
  )
}
