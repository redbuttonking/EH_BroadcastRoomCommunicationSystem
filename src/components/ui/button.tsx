import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      default: 'button-primary',
      outline: 'button-outline',
      ghost: 'button-ghost',
      destructive: 'button-destructive',
    },
    size: { default: 'button-default', sm: 'button-small', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

type Props = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  onClick,
  ...props
}: Props) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
      onClick={(event) => {
        // WebKit does not always focus pointer-activated buttons. Capture the
        // opener before a dialog moves focus, consistently with keyboard use.
        if (!event.defaultPrevented) event.currentTarget.focus({ preventScroll: true })
        onClick?.(event)
      }}
    />
  )
}
