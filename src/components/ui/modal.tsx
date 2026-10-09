import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Modal({
  open,
  onDismiss,
  titleId,
  className = '',
  disabled = false,
  dialogRef,
  initialFocusRef,
  children,
}: {
  open: boolean
  onDismiss: () => void
  titleId: string
  className?: string
  disabled?: boolean
  dialogRef?: RefObject<HTMLDialogElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const localRef = useRef<HTMLDialogElement>(null)
  const ref = dialogRef ?? localRef
  const startedOutside = useRef(false)
  useEffect(() => {
    const element = ref.current
    const returnFocus = document.activeElement
    if (open && element && !element.open) {
      element.showModal()
      initialFocusRef?.current?.focus({ preventScroll: true })
    }
    return () => {
      element?.close()
      startedOutside.current = false
      if (open && returnFocus instanceof HTMLElement) {
        queueMicrotask(() => {
          if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true })
        })
      }
    }
  }, [open, ref, initialFocusRef])
  const isOutside = (element: HTMLDialogElement, x: number, y: number) => {
    const bounds = element.getBoundingClientRect()
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
  }
  return (
    <dialog
      ref={ref}
      className={`confirm-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!disabled) onDismiss()
      }}
      onPointerDown={(event) => {
        startedOutside.current =
          event.button === 0 &&
          event.target === event.currentTarget &&
          isOutside(event.currentTarget, event.clientX, event.clientY)
      }}
      onPointerCancel={() => {
        startedOutside.current = false
      }}
      onClick={(event) => {
        const dismiss =
          startedOutside.current &&
          event.target === event.currentTarget &&
          isOutside(event.currentTarget, event.clientX, event.clientY)
        startedOutside.current = false
        if (dismiss && !disabled) onDismiss()
      }}
    >
      {children}
    </dialog>
  )
}

export function ModalHeader({
  title,
  titleId,
  description,
  onDismiss,
  disabled = false,
}: {
  title: string
  titleId: string
  description?: string
  onDismiss: () => void
  disabled?: boolean
}) {
  return (
    <div className="modal-header">
      <div>
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${title} 닫기`}
        onClick={onDismiss}
        disabled={disabled}
      >
        <X size={20} />
      </Button>
    </div>
  )
}
