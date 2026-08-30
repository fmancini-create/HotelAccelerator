"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, ExternalLink, Link2, RefreshCw, Trash2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

interface ProviderInfo {
  id: "facebook" | "instagram" | "x" | "linkedin"
  label: string
  description: string
  capabilities: string[]
  approvalNote: string
}

interface SocialAccount {
  id: string
  display_name: string | null
  config: Record<string, any>
  is_active: boolean
  last_inbound_at: string | null
  last_error: string | null
}

interface StatusPayload {
  provider: ProviderInfo
  appConfigured: boolean
  xDmRequested?: boolean
  accounts: SocialAccount[]
  error?: string
}

const CAPABILITY_LABELS: Record<string, string> = {
  direct_messages: "Messaggi diretti",
  mentions: "Menzioni",
  comments: "Commenti",
  posts: "Post",
  reactions: "Reazioni",
}

export function SocialChannelPage({ provider }: { provider: "facebook" | "instagram" | "twitter" | "linkedin" }) {
  const apiProvider = provider === "twitter" ? "x" : provider
  const searchParams = useSearchParams()
  const [data, setData] = useState<StatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/channels/social/${apiProvider}`, { cache: "no-store" })
      const payload = (await response.json()) as StatusPayload
      if (!response.ok) throw new Error(payload.error || "Impossibile leggere il canale")
      setData(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore nel caricamento")
    } finally {
      setLoading(false)
    }
  }, [apiProvider])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const connected = searchParams.get("connected")
    const error = searchParams.get("error")
    if (connected) toast.success(`${connected} connessione${connected === "1" ? "" : "i"} collegata${connected === "1" ? "" : "e"}`)
    if (error) toast.error(error)
  }, [searchParams])

  const disconnect = async (id: string) => {
    setDeleting(id)
    try {
      const response = await fetch(`/api/channels/social/${apiProvider}?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Disconnessione non riuscita")
      toast.success("Connessione rimossa")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disconnessione non riuscita")
    } finally {
      setDeleting(null)
    }
  }

  const providerInfo = data?.provider
  const title = providerInfo?.label || (provider === "twitter" ? "X" : provider)

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader title={`Canale ${title}`} subtitle="Connessione OAuth ufficiale e capability disponibili nella Inbox" />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription className="mt-2 max-w-2xl">{providerInfo?.description}</CardDescription>
              </div>
              <Button asChild disabled={data ? !data.appConfigured : true}>
                <a href={`/api/channels/social/${apiProvider}/connect`}>
                  <Link2 className="mr-2 h-4 w-4" /> Collega con OAuth
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loading && data && !data.appConfigured && (
              <div className="flex gap-3 rounded-lg border border-ha-warning-soft bg-ha-warning-soft p-4 text-sm text-ha-warning-soft-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>Le credenziali applicative di produzione non sono ancora configurate. Il collegamento OAuth diventerà disponibile appena vengono inserite.</div>
              </div>
            )}
            {providerInfo && (
              <div>
                <div className="mb-2 text-sm font-medium">Funzioni ufficiali usate</div>
                <div className="flex flex-wrap gap-2">
                  {providerInfo.capabilities.map((capability) => (
                    <Badge key={capability} variant="secondary">{CAPABILITY_LABELS[capability] || capability}</Badge>
                  ))}
                  {providerInfo.id === "x" && (
                    <Badge variant={data?.xDmRequested ? "secondary" : "outline"}>
                      DM {data?.xDmRequested ? "richiesti all'OAuth" : "non richiesti"}
                    </Badge>
                  )}
                  {providerInfo.id === "linkedin" && <Badge variant="outline">DM Pagina non supportati</Badge>}
                </div>
              </div>
            )}
            {providerInfo && <p className="text-sm text-muted-foreground">{providerInfo.approvalNote}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Account collegati</CardTitle>
                <CardDescription>Ogni account usa il proprio token cifrato e le proprie capability effettive.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Aggiorna
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Caricamento...</div>
            ) : !data?.accounts.length ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nessun account collegato.</div>
            ) : (
              <div className="space-y-3">
                {data.accounts.map((account) => {
                  const caps = account.config?.capabilities || {}
                  return (
                    <div key={account.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium">{account.display_name || account.config?.external_account_id}</div>
                          <Badge variant={account.is_active ? "secondary" : "outline"}>
                            {account.is_active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                            {account.is_active ? "Attivo" : "Spento"}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(caps).filter(([, enabled]) => enabled).map(([key]) => (
                            <Badge key={key} variant="outline" className="text-xs">{CAPABILITY_LABELS[key] || key}</Badge>
                          ))}
                        </div>
                        {account.last_error && <div className="mt-2 text-xs text-destructive">{account.last_error}</div>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => void disconnect(account.id)} disabled={deleting === account.id}>
                        <Trash2 className="mr-2 h-4 w-4" /> Disconnetti
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Gli eventi supportati vengono normalizzati nella Inbox unica. Le funzioni non concesse dal provider restano disabilitate invece di essere simulate.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
