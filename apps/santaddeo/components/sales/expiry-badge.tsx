"use client"

import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"

/**
 * Badge che mostra il countdown alla scadenza dell'assegnazione di un prospect.
 * Colori:
 *  - rosso  se mancano <= 7 giorni
 *  - giallo se mancano <= 14 giorni
 *  - grigio altrimenti
 *  - rosso scuro se gia' scaduto (caso edge: cron non ancora passato)
 */
export function ExpiryBadge({
  expiresAt,
  short = true,
}: {
  expiresAt: string
  short?: boolean
}) {
  const now = new Date()
  const exp = new Date(expiresAt)
  const diffMs = exp.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  let cls = "bg-gray-100 text-gray-700"
  let label = ""

  if (diffDays < 0) {
    cls = "bg-red-200 text-red-900"
    label = short ? "Scaduta" : "Assegnazione scaduta"
  } else if (diffDays <= 7) {
    cls = "bg-red-100 text-red-800"
    label = short ? `Scade in ${diffDays}g` : `Scade tra ${diffDays} giorni`
  } else if (diffDays <= 14) {
    cls = "bg-yellow-100 text-yellow-800"
    label = short ? `Scade in ${diffDays}g` : `Scade tra ${diffDays} giorni`
  } else {
    label = short
      ? `Scade in ${diffDays}g`
      : `Scade tra ${diffDays} giorni (${exp.toLocaleDateString("it-IT")})`
  }

  return (
    <Badge variant="outline" className={`${cls} inline-flex items-center gap-1 text-[10px] font-normal w-fit`}>
      <Clock className="h-2.5 w-2.5" />
      {label}
    </Badge>
  )
}
