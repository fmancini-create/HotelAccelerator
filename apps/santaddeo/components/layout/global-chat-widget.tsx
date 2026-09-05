"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"

const AiChatPanel = dynamic(
  () => import("@/components/dashboard/ai-chat-panel").then((mod) => mod.AiChatPanel),
  { ssr: false, loading: () => null },
)

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

let hotelCache: { id: string; name: string } | null | "none" = undefined as any

export function GlobalChatWidget() {
  const pathname = usePathname()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [hotelName, setHotelName] = useState("")
  const [checked, setChecked] = useState(false)
  const fetchedRef = useRef(false)

  const isPrivateApp = PRIVATE_APP_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
  const isExcluded = !isPrivateApp

  useEffect(() => {
    if (isExcluded) {
      setChecked(true)
      return
    }

    if (hotelCache !== undefined) {
      if (hotelCache && hotelCache !== "none") {
        setHotelId(hotelCache.id)
        setHotelName(hotelCache.name)
      }
      setChecked(true)
      return
    }

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

  // Una sola istanza globale anche sulla dashboard: cosi' la chat non viene
  // smontata/rimontata quando cambia route e mantiene la cronologia visibile.
  if (isExcluded || !checked || !hotelId) return null

  return <AiChatPanel hotelId={hotelId} hotelName={hotelName} />
}
