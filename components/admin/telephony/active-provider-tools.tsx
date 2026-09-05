"use client"

import Link from "next/link"
import useSWR from "swr"

import { Button } from "@/components/ui/button"

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include", cache: "no-store" })
  if (!response.ok) return null
  return response.json()
}

/**
 * Navigazione provider-aware per gli strumenti avanzati del centralino.
 *
 * Il layout condiviso resta agnostico: i link specifici 3CX compaiono soltanto
 * quando l'integrazione attiva dichiarata dal backend è realmente 3CX.
 */
export function ActiveTelephonyProviderTools() {
  const { data } = useSWR("/api/telephony/providers", fetcher, { revalidateOnFocus: false })
  const activeProvider = data?.active_integration?.provider

  if (activeProvider !== "3cx") return null

  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href="/admin/channels/phone/3cx">Configurazione avanzata 3CX</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/admin/channels/phone/audio">Esperienza audio 3CX</Link>
      </Button>
    </>
  )
}
