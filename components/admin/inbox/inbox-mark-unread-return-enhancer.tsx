"use client"

import { useEffect } from "react"

const GMAIL_THREAD_ACTION = /^\/api\/gmail\/threads\/[^/]+\/actions$/
const GMAIL_MESSAGE_ACTION = /^\/api\/gmail\/messages\/[^/]+$/

function pathFromFetch(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return new URL(input, window.location.origin).pathname
    if (input instanceof URL) return input.pathname
    return new URL(input.url, window.location.origin).pathname
  } catch {
    return ""
  }
}

function methodFromFetch(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase()
  return "GET"
}

function jsonBody(init?: RequestInit): Record<string, unknown> | null {
  if (typeof init?.body !== "string") return null
  try {
    const parsed = JSON.parse(init.body)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isMarkUnreadRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (methodFromFetch(input, init) !== "POST") return false

  const path = pathFromFetch(input)
  const body = jsonBody(init)
  if (!body) return false

  if (path === "/api/inbox/bulk") return body.markUnread === true

  if (GMAIL_THREAD_ACTION.test(path) || GMAIL_MESSAGE_ACTION.test(path)) {
    return body.action === "markAsUnread"
  }

  return false
}

function findDetailBackButton(): HTMLButtonElement | null {
  const exact = document.querySelector<HTMLButtonElement>("button.h-9.w-9.mr-1")
  if (exact?.querySelector("svg.lucide-chevron-left")) return exact

  return (
    Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      if (!button.querySelector("svg.lucide-chevron-left")) return false
      if (button.title.toLowerCase().includes("pagina precedente")) return false
      return (button.textContent || "").trim() === ""
    }) ?? null
  )
}

/**
 * UX rule for the Inbox detail view:
 * once an open message is deliberately marked "da leggere" / unread, return
 * to the conversation list. The navigation happens only after the server has
 * confirmed the state change, so a failed request never throws the operator
 * out of the message they were working on.
 */
export function InboxMarkUnreadReturnEnhancer() {
  useEffect(() => {
    const previousFetch = window.fetch.bind(window)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const shouldReturn = isMarkUnreadRequest(input, init)
      const detailBackButton = shouldReturn ? findDetailBackButton() : null
      const response = await previousFetch(input, init)

      if (shouldReturn && detailBackButton && response.ok) {
        window.setTimeout(() => {
          const currentBackButton = detailBackButton.isConnected ? detailBackButton : findDetailBackButton()
          currentBackButton?.click()
        }, 0)
      }

      return response
    }

    return () => {
      window.fetch = previousFetch
    }
  }, [])

  return null
}
