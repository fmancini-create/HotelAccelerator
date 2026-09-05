"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"

import {
  DashboardCallQuickAction,
  DashboardMessageQuickAction,
} from "@/components/admin/dashboard/dashboard-quick-actions"
import { DashboardNativeTaskQuickAction } from "@/components/admin/dashboard/dashboard-native-task-quick-action"

type Mounts = {
  messages: HTMLElement | null
  tasks: HTMLElement | null
  calls: HTMLElement | null
}

const EMPTY: Mounts = { messages: null, tasks: null, calls: null }

function findHeader(title: string) {
  const headings = Array.from(document.querySelectorAll("h3"))
  const heading = headings.find((node) => node.textContent?.trim() === title)
  return heading?.closest("div.flex.items-center.justify-between.border-b") as HTMLElement | null
}

function ensureMount(header: HTMLElement | null, key: string) {
  if (!header) return null
  const selector = `[data-dashboard-quick-action="${key}"]`
  const existing = header.querySelector(selector) as HTMLElement | null
  if (existing) return existing

  const title = header.firstElementChild as HTMLElement | null
  if (title) title.style.marginRight = "auto"
  header.style.gap = "0.5rem"

  const host = document.createElement("span")
  host.dataset.dashboardQuickAction = key
  host.className = "inline-flex shrink-0"

  const trailingLink = header.querySelector(":scope > a")
  if (trailingLink) header.insertBefore(host, trailingLink)
  else header.appendChild(host)
  return host
}

export function DashboardCardQuickActionMounts() {
  const pathname = usePathname()
  const [mounts, setMounts] = useState<Mounts>(EMPTY)

  useEffect(() => {
    if (pathname !== "/admin/dashboard") {
      setMounts(EMPTY)
      return
    }

    let frame = 0
    const scan = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next: Mounts = {
          messages: ensureMount(findHeader("Messaggi recenti"), "messages"),
          tasks: ensureMount(findHeader("Attività da fare"), "tasks"),
          calls: ensureMount(findHeader("Telefonate"), "calls"),
        }
        setMounts((current) =>
          current.messages === next.messages && current.tasks === next.tasks && current.calls === next.calls
            ? current
            : next,
        )
      })
    }

    scan()
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.querySelectorAll("[data-dashboard-quick-action]").forEach((node) => node.remove())
    }
  }, [pathname])

  if (pathname !== "/admin/dashboard") return null

  return (
    <>
      {mounts.messages && createPortal(<DashboardMessageQuickAction />, mounts.messages)}
      {mounts.tasks && createPortal(
        <DashboardNativeTaskQuickAction onCreated={() => window.location.reload()} />,
        mounts.tasks,
      )}
      {mounts.calls && createPortal(<DashboardCallQuickAction />, mounts.calls)}
    </>
  )
}
