"use client"

import Link from "next/link"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { CalendarClock } from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

/**
 * Link "Richieste demo" con badge del numero di richieste pending (polling 60s).
 * Porta alla pagina di approvazione /superadmin/demo-requests.
 */
export function DemoRequestsLink() {
  const { data } = useSWR<{ counts: Record<string, number> }>(
    "/api/superadmin/demo-requests?status=pending",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const pending = data?.counts?.pending || 0

  return (
    <Link
      href="/superadmin/demo-requests"
      className="relative inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
    >
      <CalendarClock className="h-4 w-4" />
      Richieste demo
      {pending > 0 && (
        <Badge className="ml-1 bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0">{pending}</Badge>
      )}
    </Link>
  )
}
