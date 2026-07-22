'use client'

import * as React from 'react'
import * as HoverCardPrimitive from '@radix-ui/react-hover-card'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

/**
 * Touch-aware HoverCard: uses native hover on desktop, click/tap Popover on touch devices.
 * A shared context ensures Root, Trigger, and Content always agree on which primitive to use,
 * avoiding the "must be used within" Radix error during hydration.
 */

const TouchModeContext = React.createContext(false)

function HoverCard({
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  const [isTouch, setIsTouch] = React.useState(false)

  React.useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  return (
    <TouchModeContext.Provider value={isTouch}>
      {isTouch ? (
        <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>
      ) : (
        <HoverCardPrimitive.Root data-slot="hover-card" {...props}>{children}</HoverCardPrimitive.Root>
      )}
    </TouchModeContext.Provider>
  )
}

function HoverCardTrigger({
  children,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  const isTouch = React.useContext(TouchModeContext)

  if (isTouch) {
    return (
      <PopoverPrimitive.Trigger data-slot="hover-card-trigger" asChild {...props}>
        {children}
      </PopoverPrimitive.Trigger>
    )
  }
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props}>
      {children}
    </HoverCardPrimitive.Trigger>
  )
}

function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  const isTouch = React.useContext(TouchModeContext)

  const contentClassName = cn(
    'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 rounded-md border p-4 shadow-md outline-hidden',
    className,
  )

  if (isTouch) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="hover-card-content"
          align={align}
          sideOffset={sideOffset}
          className={cn(contentClassName, 'origin-(--radix-popover-content-transform-origin) max-h-[70vh] overflow-y-auto')}
          {...(props as any)}
        />
      </PopoverPrimitive.Portal>
    )
  }

  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(contentClassName, 'origin-(--radix-hover-card-content-transform-origin)')}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
