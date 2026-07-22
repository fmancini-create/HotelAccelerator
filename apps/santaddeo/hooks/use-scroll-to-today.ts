"use client"

import { useEffect, useRef, useCallback } from "react"

/**
 * Hook that scrolls a horizontal container so that "today" column
 * appears as the 3rd visible column.
 * 
 * Usage:
 * 1. Attach `scrollRef` to the `overflow-x-auto` container div
 * 2. Add `data-date="YYYY-MM-DD"` to each date column <th> or <td>
 * 3. Call `scrollToToday()` after data loads, or rely on auto-scroll
 * 
 * @param dates - array of date strings (YYYY-MM-DD) in column order
 * @param deps - additional dependencies to trigger re-scroll
 */
export function useScrollToToday(dates: string[], deps: any[] = []) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  const scrollToToday = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    const today = new Date().toISOString().split("T")[0]
    const todayIndex = dates.findIndex((d) => d === today)

    if (todayIndex < 0) return

    // We want today to be the 3rd column (index 2 visually).
    // Find the column width by looking at the first header cell with data-date
    const headerCells = container.querySelectorAll("th[data-date], td[data-date]")
    if (headerCells.length === 0) return

    // Get the first sticky/label column width (the leftmost column without data-date)
    const firstRow = container.querySelector("thead tr")
    let labelColumnWidth = 0
    if (firstRow) {
      const firstTh = firstRow.querySelector("th")
      if (firstTh) {
        labelColumnWidth = firstTh.offsetWidth
      }
    }

    // Calculate column width from date cells
    const firstDateCell = headerCells[0] as HTMLElement
    const colWidth = firstDateCell?.offsetWidth || 80

    // Scroll so today is at position 2 (3rd column after label column)
    // scrollLeft = (todayIndex - 2) * colWidth
    const targetScroll = Math.max(0, (todayIndex - 2) * colWidth)
    container.scrollLeft = targetScroll
  }, [dates])

  useEffect(() => {
    if (dates.length > 0 && !hasScrolled.current) {
      // Small delay to let the DOM render
      const timer = setTimeout(() => {
        scrollToToday()
        hasScrolled.current = true
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [dates, scrollToToday, ...deps])

  // Reset when dates change significantly
  useEffect(() => {
    hasScrolled.current = false
  }, [dates.length])

  return { scrollRef, scrollToToday }
}
