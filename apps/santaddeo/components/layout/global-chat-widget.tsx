"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"

const AiChatPanel = dynamic(
  () => import("@/components/dashboard/ai-chat-panel").then((mod) => mod.AiChatPanel),
  { ssr: false, loading: () => null },
)

// FIX 03/05/2026 (incident "RevMentor appare nel front-end pubblico"):
// La logica precedente era una blacklist (EXCLUDED_PATHS) che escludeva i
// path pubblici noti. Ma man mano che abbiamo aggiunto pagine pubbliche
// (/blog, /seo, /about, /features, /team, /partner*, /request-info,
// /coming-soon, ecc.) nessuna e' stata aggiunta alla blacklist e il widget
// "RevMentor" e' finito ovunque. Inversione: ALLOWLIST. Il widget appare
// SOLO sulle aree app autenticate. Stesso pattern usato dal PageGuideButton
// per la chat guida blu (vedi memoria 02/05/2026 - PRIVATE_APP_PATHS).
//
// /superadmin e /accelerator NON sono inclusi: rispettano il comportamento
// pre-esistente (widget RevMentor non mostrato in quelle aree, hanno UI
// dedicate o non vogliono la chat hotel-specific).
const PRIVATE_APP_PATHS = [
  "/dati",
  "/dashboard",
  "/dashboard-v2",
  "/dashboard-v3",
  "/calendar",
  "/occupancy",
  "/settings",
  "/profilo",
  "/profile",
  "/notifiche",
  "/notifications",
  "/onboarding",
]

// Module-level cache: one fetch per session, not per navigation
let hotelCache: { id: string; name: string } | null | "none" = undefined as any

export function GlobalChatWidget() {
  const pathname = usePathname()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [checked, setChecked] = useState(false)
  const fetchedRef = useRef(false)

  // Check if we're on a private app path (allowlist).
  // Default = pubblico → widget non mostrato.
  const isPrivateApp = PRIVATE_APP_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
  const isExcluded = !isPrivateApp

  useEffect(() => {
    if (isExcluded) {
      setChecked(true)
      return
    }

    // Use cached result if available -- avoids re-fetching on every navigation
    if (hotelCache !== undefined) {
      if (hotelCache && hotelCache !== "none") {
        setHotelId(hotelCache.id)
        setHotelName(hotelCache.name)
      }
      setChecked(true)
      return
    }

    // Only fetch once even if effect fires multiple times
    if (fetchedRef.current) return
    fetchedRef.current = true

    async function loadHotel() {
      try {
        const res = await fetch("/api/ui/selected-hotel")
        if (!res.ok) { hotelCache = "none"; setChecked(true); return }
        const data = await res.json()
        if (data.hotel) {
          hotelCache = { id: data.hotel.id, name: data.hotel.name || "" }
          setHotelId(data.hotel.id)
          setHotelName(data.hotel.name || "")
        } else {
          hotelCache = "none"
        }
      } catch {
        hotelCache = "none"
      } finally {
        setChecked(true)
      }
    }

    loadHotel()
  }, [isExcluded])

  // Don't render on excluded paths, or if no hotel, or while checking
  if (isExcluded || !checked || !hotelId) return null

  // Don't render if the dashboard shell already has its own AiChatPanel
  if (pathname === "/dashboard") return null

  return <AiChatPanel hotelId={hotelId} hotelName={hotelName} />
}
