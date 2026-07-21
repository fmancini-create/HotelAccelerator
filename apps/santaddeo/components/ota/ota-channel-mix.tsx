"use client"

import { Progress } from "@/components/ui/progress"

interface ChannelRow {
  channel: string
  bookings: number
  revenue: number
  revenueShare: number
}

interface Mix {
  totalBookings: number
  totalRevenue: number
  bookingComShare: number
  channels: ChannelRow[]
}

export function OtaChannelMix({ mix, compact }: { mix: Mix; compact?: boolean }) {
  if (mix.totalRevenue === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna prenotazione negli ultimi 90gg.</p>
  }

  // Sort channels by revenue share desc, cap to 6 entries, group rest in "Altri"
  const sorted = [...mix.channels].sort((a, b) => b.revenueShare - a.revenueShare)
  const top = sorted.slice(0, 6)
  const rest = sorted.slice(6)
  const restShare = rest.reduce((s, c) => s + c.revenueShare, 0)
  const restRevenue = rest.reduce((s, c) => s + c.revenue, 0)

  const displayRows: ChannelRow[] = [
    ...top,
    ...(rest.length > 0
      ? [
          {
            channel: `Altri (${rest.length})`,
            bookings: rest.reduce((s, c) => s + c.bookings, 0),
            revenue: restRevenue,
            revenueShare: restShare,
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-baseline gap-2 pb-2 border-b">
          <span className="text-3xl font-bold">
            {(mix.bookingComShare * 100).toFixed(1)}%
          </span>
          <span className="text-sm text-muted-foreground">di fatturato da Booking.com</span>
        </div>
      )}

      <ul className="space-y-2">
        {displayRows.map((c) => (
          <li key={c.channel}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium capitalize">{formatChannelLabel(c.channel)}</span>
              <span className="text-muted-foreground tabular-nums">
                {(c.revenueShare * 100).toFixed(1)}%
              </span>
            </div>
            <Progress value={c.revenueShare * 100} className="h-1.5" />
            {!compact && (
              <p className="text-xs text-muted-foreground mt-1">
                {c.bookings} prenotazioni · €
                {Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(c.revenue)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatChannelLabel(raw: string): string {
  if (!raw) return "Sconosciuto"
  const normalized = raw.toLowerCase().replace(/[_-]/g, " ")
  if (/booking/.test(normalized)) return "Booking.com"
  if (/airbnb/.test(normalized)) return "Airbnb"
  if (/expedia/.test(normalized)) return "Expedia"
  if (/direct|diretto/.test(normalized)) return "Diretto"
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase())
}
