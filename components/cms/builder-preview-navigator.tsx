"use client"

import type { MouseEvent } from "react"
import { BuilderLiveRenderer } from "@/components/cms/builder-live-renderer"
import type { CMSBuilderDocument } from "@/lib/cms/builder-document"

type Breakpoint = "desktop" | "tablet" | "mobile"

export function BuilderPreviewNavigator({
  document,
  pageId,
  breakpoint,
  onPageChange,
}: {
  document: CMSBuilderDocument
  pageId: string
  breakpoint: Breakpoint
  onPageChange: (pageId: string) => void
}) {
  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const anchor = target.closest("a")
    if (!anchor) return

    const href = anchor.getAttribute("href") || ""
    if (!href.startsWith("/") || href.startsWith("//")) return

    const destination = document.pages.find((page) => page.slug === href)
    if (!destination) return

    event.preventDefault()
    event.stopPropagation()
    onPageChange(destination.id)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <BuilderLiveRenderer document={document} pageId={pageId} breakpoint={breakpoint} />
    </div>
  )
}
