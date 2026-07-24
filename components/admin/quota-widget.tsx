"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"

interface QuotaData {
  pages: { current: number; limit: number }
  photos: { current: number; limit: number }
  conversations: { current: number; limit: number }
  storage: { current: number; limit: number }
  plan: string
}

export function QuotaWidget() {
  const [quotas, setQuotas] = useState<QuotaData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadQuotas() {
      try {
        const response = await fetch("/api/admin/quotas")
        if (response.ok) {
          const data = await response.json()
          setQuotas(data)
        }
      } catch (error) {
        console.error("Failed to load quotas:", error)
      } finally {
        setLoading(false)
      }
    }

    loadQuotas()
  }, [])

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="space-y-4">
          <div className="h-4 bg-muted rounded"></div>
          <div className="h-4 bg-muted rounded"></div>
          <div className="h-4 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  if (!quotas) return null

  // Semantica Santaddeo: verde = in linea, ambra = richiede monitoraggio,
  // rosso = intervento consigliato (stessa legenda della dashboard V1).
  const getProgressColor = (current: number, limit: number) => {
    if (limit === -1) return "bg-ha-success"
    const percentage = (current / limit) * 100
    if (percentage >= 90) return "bg-ha-error"
    if (percentage >= 75) return "bg-ha-warning"
    return "bg-ha-success"
  }

  const isNearLimit = (current: number, limit: number) => {
    if (limit === -1) return false
    return (current / limit) * 100 >= 80
  }

  const formatStorage = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const quotaItems = [
    {
      label: "Pagine CMS",
      current: quotas.pages.current,
      limit: quotas.pages.limit,
      format: (n: number) => n.toString(),
    },
    {
      label: "Foto",
      current: quotas.photos.current,
      limit: quotas.photos.limit,
      format: (n: number) => n.toString(),
    },
    {
      label: "Conversazioni/mese",
      current: quotas.conversations.current,
      limit: quotas.conversations.limit,
      format: (n: number) => n.toString(),
    },
    {
      label: "Storage",
      current: quotas.storage.current,
      limit: quotas.storage.limit,
      format: formatStorage,
    },
  ]

  const hasWarnings = quotaItems.some((q) => isNearLimit(q.current, q.limit))

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium text-foreground">Utilizzo Risorse</h3>
          {hasWarnings && <AlertTriangle className="w-5 h-5 text-ha-warning" />}
        </div>
        <span className="px-3 py-1 bg-ha-brand text-ha-brand-foreground text-xs rounded-full uppercase tracking-wide">
          {quotas.plan}
        </span>
      </div>

      <div className="space-y-5">
        {quotaItems.map((item) => {
          const percentage = item.limit === -1 ? 5 : (item.current / item.limit) * 100
          const nearLimit = isNearLimit(item.current, item.limit)

          return (
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-2">
                <span className={`${nearLimit ? "text-ha-warning font-medium" : "text-muted-foreground"}`}>
                  {item.label}
                  
                </span>
                <span className="text-foreground font-medium">
                  {item.format(item.current)} / {item.limit === -1 ? "∞" : item.format(item.limit)}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getProgressColor(item.current, item.limit)}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {hasWarnings && (
        <div className="mt-4 p-3 bg-ha-warning-soft border border-ha-warning/30 rounded-lg">
          <p className="text-sm text-ha-warning-soft-foreground">
            Stai raggiungendo i limiti del piano <strong>{quotas.plan}</strong>. Considera un upgrade per aumentare le
            risorse disponibili.
          </p>
        </div>
      )}
    </div>
  )
}
