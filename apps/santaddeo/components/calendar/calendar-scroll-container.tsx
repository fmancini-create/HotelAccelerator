"use client"

import { useRef, useEffect, useState, useCallback, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarDays } from "lucide-react"

interface CalendarScrollContainerProps {
  children: ReactNode
  /** Number of day columns (e.g. 28, 30, 31) */
  columnCount: number
  /** Approximate width of each day column in px */
  columnWidth?: number
  /** Index of "today" column (0-based). If -1, today is not in this month */
  todayIndex?: number
  /** CSS class for the outer wrapper */
  className?: string
}

/**
 * Wraps a horizontally-scrollable calendar table with:
 * 1. Auto-scroll so "today" sits in the 4th-5th visible column
 * 2. Sticky top scroll bar + arrow buttons for easy horizontal navigation
 * 3. Keyboard left/right arrow support
 */
export function CalendarScrollContainer({
  children,
  columnCount,
  columnWidth = 62,
  todayIndex = -1,
  className = "",
}: CalendarScrollContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)

  // Update scroll button state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 5)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5)
    setScrollProgress(scrollWidth > clientWidth ? scrollLeft / (scrollWidth - clientWidth) : 0)
  }, [])

  // Auto-scroll to today on mount (4th column position)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || todayIndex < 0) return

    // Wait for render
    requestAnimationFrame(() => {
      const targetScroll = Math.max(0, (todayIndex - 4) * columnWidth)
      el.scrollLeft = targetScroll
      updateScrollState()
    })
  }, [todayIndex, columnWidth, updateScrollState])

  // Listen to scroll events
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = () => updateScrollState()
    el.addEventListener("scroll", handler, { passive: true })
    updateScrollState()
    return () => el.removeEventListener("scroll", handler)
  }, [updateScrollState])

  // Also re-check after children render
  useEffect(() => {
    requestAnimationFrame(updateScrollState)
  }, [children, updateScrollState])

  // Pin manuale della barra di scorrimento orizzontale.
  // Un antenato con overflow rompe il `position: sticky`, quindi la barra
  // scorreva via verticalmente: per avanzare nel calendario stando in basso
  // si era costretti a risalire. Replichiamo la stessa tecnica usata sul
  // <thead> (translateY dinamico) cosi' la barra resta pinnata in alto e
  // scorre INSIEME all'header, restando sempre raggiungibile.
  useEffect(() => {
    const BAR_OFFSET = 64 // altezza navbar (la barra si pinna appena sotto)
    let currentOffset = 0

    const apply = () => {
      const bar = barRef.current
      const wrapper = wrapperRef.current
      if (!bar || !wrapper) return
      const barRect = bar.getBoundingClientRect()
      const wrapperRect = wrapper.getBoundingClientRect()
      const naturalTop = barRect.top - currentOffset
      const barHeight = barRect.height
      let next = 0
      if (naturalTop < BAR_OFFSET) {
        const desired = BAR_OFFSET - naturalTop
        // Non far uscire la barra dal fondo del contenitore della tabella
        const maxOffset = wrapperRect.bottom - naturalTop - barHeight
        next = Math.min(desired, Math.max(0, maxOffset))
      }
      if (Math.abs(next - currentOffset) >= 0.5) {
        bar.style.transform = next ? `translate3d(0, ${next}px, 0)` : ""
        bar.style.willChange = next ? "transform" : ""
        currentOffset = next
      }
    }

    window.addEventListener("scroll", apply, { passive: true })
    window.addEventListener("resize", apply)
    document.addEventListener("scroll", apply, { capture: true, passive: true })
    apply()
    const raf = requestAnimationFrame(apply)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      document.removeEventListener("scroll", apply, { capture: true } as EventListenerOptions)
      const bar = barRef.current
      if (bar) {
        bar.style.transform = ""
        bar.style.willChange = ""
      }
    }
  }, [])

  const scrollBy = useCallback((amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" })
  }, [])

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current
    if (!el || todayIndex < 0) return
    const targetScroll = Math.max(0, (todayIndex - 4) * columnWidth)
    el.scrollTo({ left: targetScroll, behavior: "smooth" })
  }, [todayIndex, columnWidth])

  const step = columnWidth * 5 // scroll 5 days at a time
  const bigStep = columnWidth * 15 // scroll 15 days

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Barra di scorrimento orizzontale, pinnata manualmente (vedi effect)
          cosi' resta visibile scorrendo verticalmente. */}
      {/* FIX 15/07/2026: data-calendar-hbar permette al pinning del thead
          (pagina pricing) di ancorarsi al bottom REALE della barra invece di
          un offset hardcoded (108px) che con zoom/densita' diverse lasciava
          una striscia scoperta dove le righe scrollate trasparivano.
          Sfondo pieno (non /95) per non lasciar intravedere il contenuto. */}
      <div
        ref={barRef}
        data-calendar-hbar
        className="relative z-40 bg-background border-b px-2 py-1.5 flex items-center gap-2"
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(-bigStep)}
            disabled={!canScrollLeft}
            aria-label="Indietro 15 giorni"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(-step)}
            disabled={!canScrollLeft}
            aria-label="Indietro 5 giorni"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Mini scroll track */}
        <div className="flex-1 mx-2 h-1.5 bg-muted rounded-full relative overflow-hidden cursor-pointer"
          onClick={(e) => {
            const el = scrollRef.current
            if (!el) return
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            el.scrollTo({ left: pct * (el.scrollWidth - el.clientWidth), behavior: "smooth" })
          }}
        >
          <div
            className="absolute top-0 left-0 h-full bg-primary/40 rounded-full transition-all duration-150"
            style={{ width: `${Math.max(10, (1 / Math.max(1, columnCount / 7)) * 100)}%`, left: `${scrollProgress * (100 - Math.max(10, (1 / Math.max(1, columnCount / 7)) * 100))}%` }}
          />
        </div>

        {todayIndex >= 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={scrollToToday}
          >
            <CalendarDays className="h-3 w-3" />
            Oggi
          </Button>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(step)}
            disabled={!canScrollRight}
            aria-label="Avanti 5 giorni"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => scrollBy(bigStep)}
            disabled={!canScrollRight}
            aria-label="Avanti 15 giorni"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="overflow-x-auto">
        {children}
      </div>
    </div>
  )
}
