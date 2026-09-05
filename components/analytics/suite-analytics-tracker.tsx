"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const VISITOR_KEY = "ha-suite-analytics-visitor-v1"
const SESSION_KEY = "ha-suite-analytics-session-v1"
const CONSENT_KEY = "hotelaccelerator-cookie-consent-v1"

function id(storage: Storage, key: string): string {
  const current = storage.getItem(key)
  if (current) return current
  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}

function hasPublicConsent(): boolean {
  const value = localStorage.getItem(CONSENT_KEY)
  return value === "accepted" || value === "all" || value === "true"
}

function referrerPath(): string | null {
  if (!document.referrer) return null
  try {
    const u = new URL(document.referrer)
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

export function SuiteAnalyticsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    const backend = pathname.startsWith("/admin") || pathname.startsWith("/super-admin")
    if (!backend && !hasPublicConsent()) return

    const visitorId = id(localStorage, VISITOR_KEY)
    const sessionId = id(sessionStorage, SESSION_KEY)
    const search = new URLSearchParams(window.location.search)
    const utm = (name: string) => search.get(name)?.slice(0, 300) || null

    const payload = {
      platformKey: "hotelaccelerator",
      events: [
        {
          surface: backend ? "backend" : "public",
          eventType: "page_view",
          eventName: pathname,
          occurredAt: new Date().toISOString(),
          visitorId,
          sessionId,
          pagePath: pathname,
          pageTitle: document.title,
          referrer: referrerPath(),
          utmSource: utm("utm_source"),
          utmMedium: utm("utm_medium"),
          utmCampaign: utm("utm_campaign"),
          utmContent: utm("utm_content"),
          utmTerm: utm("utm_term"),
          language: navigator.language,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
        },
      ],
    }

    void fetch("/api/platform/analytics/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ha-analytics-session": sessionId,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  }, [pathname])

  return null
}
