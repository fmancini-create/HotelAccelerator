"use client"

import useSWR from "swr"

const fetcher = async (url: string): Promise<{ customer_code?: string }> => {
  const response = await fetch(url, { credentials: "include", cache: "no-store" })
  if (!response.ok) return {}
  return response.json()
}

export function CustomerLicenseBadge() {
  const { data } = useSWR("/api/platform/customer-code", fetcher, { revalidateOnFocus: false })
  const code = data?.customer_code?.trim()
  if (!code) return null

  return (
    <div
      className="hidden h-9 shrink-0 items-center rounded-md border border-border bg-background px-2.5 xl:flex"
      title="Codice licenza per assistenza 4BID"
      aria-label={`Codice licenza ${code}`}
    >
      <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Licenza</span>
      <code className="text-xs font-semibold text-foreground">{code}</code>
    </div>
  )
}
