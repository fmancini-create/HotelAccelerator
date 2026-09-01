"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminAuth } from "@/lib/admin-hooks"
import { AlertTriangle, ArrowLeft, CheckCircle2, CreditCard, Loader2, RefreshCw } from "lucide-react"

type PlatformBilling = {
  id?: string
  mode?: string
  business_id?: string
  currency?: string
  credit_line_id?: string | null
  system_user_id?: string | null
  status?: "pending" | "ready" | "blocked" | "error" | string
  last_error?: string | null
  last_checked_at?: string | null
}

type WhatsAppBillingChannel = {
  id: string
  property_id: string
  display_name?: string | null
  display_phone_number?: string | null
  waba_id?: string | null
  billing_status?: string | null
  billing_currency?: string | null
  billing_checked_at?: string | null
  billing_error?: string | null
  allocation_config_id?: string | null
}

type BillingPayload = {
  billing: PlatformBilling | null
  channels: WhatsAppBillingChannel[]
  error?: string
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("it-IT")
}

function statusBadge(status?: string | null) {
  const normalized = String(status ?? "pending").toLowerCase()
  if (normalized === "ready") return <Badge className="bg-ha-success">Pronto</Badge>
  if (normalized === "blocked") return <Badge variant="destructive">Bloccato</Badge>
  if (normalized === "error") return <Badge variant="destructive">Errore</Badge>
  return <Badge variant="secondary">In attesa</Badge>
}

export default function WhatsAppBillingPage() {
  const { adminUser, isLoading: authLoading } = useAdminAuth()
  const [data, setData] = useState<BillingPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconciling, setReconciling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/superadmin/whatsapp-billing", {
        credentials: "include",
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({}))) as BillingPayload
      if (!response.ok) throw new Error(payload.error || `Errore ${response.status}`)
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading) void load()
  }, [authLoading, load])

  const reconcile = async () => {
    setReconciling(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/superadmin/whatsapp-billing", {
        method: "POST",
        credentials: "include",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.platform?.error || payload?.error || `Errore ${response.status}`)
      }
      setNotice(`Riconciliazione completata: ${payload?.reconciled ?? 0} WABA aggiornati.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la riconciliazione")
    } finally {
      setReconciling(false)
    }
  }

  const isSuperAdmin = adminUser?.role === "super_admin"

  if (authLoading || loading) {
    return (
      <>
        <AdminHeader title="WhatsApp Billing 4BID" subtitle="Billing centralizzato Meta gestito dalla piattaforma" />
        <div className="container py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Caricamento stato billing…
        </div>
      </>
    )
  }

  if (!isSuperAdmin) {
    return (
      <>
        <AdminHeader title="WhatsApp Billing 4BID" />
        <div className="container py-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Accesso riservato</AlertTitle>
            <AlertDescription>Questa pagina è visibile solo al superadmin 4BID.</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  const billing = data?.billing
  const channels = data?.channels ?? []
  const readyCount = channels.filter((channel) => channel.allocation_config_id).length

  return (
    <>
      <AdminHeader title="WhatsApp Billing 4BID" subtitle="Il tenant non deve entrare in Meta: billing, credito e provisioning restano in 4BID" />
      <div className="container space-y-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/monitoring">
              <ArrowLeft className="mr-2 h-4 w-4" /> Monitoring
            </Link>
          </Button>
          <Button onClick={reconcile} disabled={reconciling}>
            {reconciling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Riprova configurazione Meta
          </Button>
        </div>

        {notice && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Operazione completata</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Billing non pronto</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Stato piattaforma</CardDescription>
              <CardTitle>{statusBadge(billing?.status)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Ultimo controllo: {formatDate(billing?.last_checked_at)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Business 4BID</CardDescription>
              <CardTitle className="text-base">{billing?.business_id || "—"}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Portfolio Meta centrale</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Linea di credito</CardDescription>
              <CardTitle className="text-base">{billing?.credit_line_id || "Non disponibile"}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Valuta: {billing?.currency || "EUR"}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>WABA con allocation 4BID</CardDescription>
              <CardTitle className="text-2xl">{readyCount} / {channels.length}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">Allocation Meta effettivamente salvata</CardContent>
          </Card>
        </div>

        {billing?.last_error && (
          <Alert variant="destructive">
            <CreditCard className="h-4 w-4" />
            <AlertTitle>Errore Meta della piattaforma</AlertTitle>
            <AlertDescription>{billing.last_error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>WABA tenant</CardTitle>
            <CardDescription>Diagnostica centralizzata. Nessuna di queste informazioni viene richiesta al tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun canale WhatsApp Coexistence attivo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 pr-4 font-medium">Tenant / numero</th>
                      <th className="py-3 pr-4 font-medium">WABA</th>
                      <th className="py-3 pr-4 font-medium">Stato</th>
                      <th className="py-3 pr-4 font-medium">Allocation ID</th>
                      <th className="py-3 pr-4 font-medium">Ultimo controllo</th>
                      <th className="py-3 font-medium">Errore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((channel) => (
                      <tr key={channel.id} className="border-b align-top last:border-0">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{channel.display_name || channel.property_id}</div>
                          <div className="text-xs text-muted-foreground">{channel.display_phone_number || "—"}</div>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs">{channel.waba_id || "—"}</td>
                        <td className="py-3 pr-4">{statusBadge(channel.billing_status)}</td>
                        <td className="py-3 pr-4 font-mono text-xs">{channel.allocation_config_id || "—"}</td>
                        <td className="py-3 pr-4 text-xs">{formatDate(channel.billing_checked_at)}</td>
                        <td className="max-w-[360px] py-3 text-xs text-ha-error">{channel.billing_error || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
