"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

const COUNTER_ID = 106059423
const MAX_VALUE_LENGTH = 50

function safeValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : undefined
}

function moduleFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  return (parts.slice(0, 2).join("/") || "home").slice(0, MAX_VALUE_LENGTH)
}

function add(target: Record<string, string | boolean>, key: string, value: string | undefined) {
  if (value) target[key] = value
}

export function YandexTenantContext() {
  const pathname = usePathname()
  const initialPathSeen = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const isInitialPath = !initialPathSeen.current
    initialPathSeen.current = true

    const send = (
      userParams: Record<string, string | boolean>,
      sessionParams: Record<string, string | boolean>,
      attempt = 0,
    ) => {
      if (cancelled) return
      const ym = (window as typeof window & {
        ym?: (id: number, method: string, ...args: unknown[]) => void
      }).ym

      if (typeof ym === "function") {
        ym(COUNTER_ID, "userParams", userParams)
        ym(COUNTER_ID, "params", sessionParams)
        if (!isInitialPath) {
          ym(COUNTER_ID, "hit", `${window.location.origin}${pathname}`, { title: document.title })
        }
        return
      }

      if (attempt < 12) {
        retry = setTimeout(() => send(userParams, sessionParams, attempt + 1), 250)
      }
    }

    const load = async () => {
      const userParams: Record<string, string | boolean> = { platform: "hotelaccelerator" }
      const sessionParams: Record<string, string | boolean> = {
        platform: "hotelaccelerator",
        module: moduleFromPath(pathname),
        route: pathname.slice(0, MAX_VALUE_LENGTH),
      }

      try {
        const response = await fetch("/api/platform/me", {
          cache: "no-store",
          credentials: "same-origin",
        })
        const context = response.ok ? await response.json() : null
        if (cancelled) return

        const activePropertyId = safeValue(context?.activePropertyId)
        const activeTenant = Array.isArray(context?.tenants)
          ? context.tenants.find((tenant: { id?: string }) => tenant?.id === context?.activePropertyId)
          : null
        const tenantName = safeValue(activeTenant?.name)
        const role = safeValue(context?.role)
        const memberRole = safeValue(context?.memberRole)
        const tenantType = safeValue(context?.activeTenantType)

        add(userParams, "tenant_id", activePropertyId)
        add(userParams, "tenant_name", tenantName)
        add(userParams, "role", role)
        add(userParams, "member_role", memberRole)
        add(userParams, "tenant_type", tenantType)
        userParams.impersonating = Boolean(role === "super_admin" && activePropertyId)

        add(sessionParams, "tenant_id", activePropertyId)
        add(sessionParams, "tenant_name", tenantName)
        add(sessionParams, "tenant_type", tenantType)
      } catch {
        // Analytics is best-effort and must never affect the product.
      }

      send(userParams, sessionParams)
    }

    void load()

    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
    }
  }, [pathname])

  useEffect(() => {
    if (typeof document === "undefined") return

    const protect = (root: ParentNode) => {
      root.querySelectorAll("input, textarea").forEach((node) => node.classList.add("ym-disable-keys"))
      root
        .querySelectorAll("[contenteditable='true'], tbody, [data-sensitive], [data-private], [data-pii], [data-secret]")
        .forEach((node) => node.classList.add("ym-hide-content"))
    }

    protect(document)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.matches("input, textarea")) node.classList.add("ym-disable-keys")
          if (node.matches("[contenteditable='true'], tbody, [data-sensitive], [data-private], [data-pii], [data-secret]")) {
            node.classList.add("ym-hide-content")
          }
          protect(node)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
