"use client"

import Link from "next/link"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { FileCheck } from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

/**
 * Link "Richieste assegnazione" da mettere in cima a /superadmin/prospects con
 * badge che mostra il numero di richieste pending. Polling SWR ogni 60s.
 */
export function AssignmentRequestsLink() {
  const { data } = useSWR<{ counts: Record<string, number> }>(
    "/api/superadmin/prospects/assignment-requests?status=pending",
    fetcher,
    { refreshInterval: 60_000 },
  )
  const pending = data?.counts?.pending || 0

  return (
    <Link
      href="/superadmin/assignment-requests"
      className="relative inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
    >
      <FileCheck className="h-4 w-4" />
      Richieste assegnazione
      {pending > 0 && (
        <Badge className="ml-1 bg-amber-500 hover:bg-amber-500 text-xs px-1.5 py-0">
          {pending}
        </Badge>
      )}
    </Link>
  )
}
