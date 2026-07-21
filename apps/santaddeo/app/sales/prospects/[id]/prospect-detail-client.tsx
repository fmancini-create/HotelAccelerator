"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import {
  ArrowLeft,
  Star,
  Phone,
  Mail,
  Globe,
  MapPin,
  ExternalLink,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

import { ActivityTimeline } from "./activity-timeline"
import { ExpiryBadge } from "@/components/sales/expiry-badge"
import { ReleaseProspectButton } from "@/components/sales/release-prospect-button"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUSES = [
  { value: "assigned", label: "Da contattare", color: "bg-blue-100 text-blue-800" },
  { value: "contacted", label: "Contattato", color: "bg-yellow-100 text-yellow-800" },
  { value: "meeting_scheduled", label: "Demo fissata", color: "bg-purple-100 text-purple-800" },
  { value: "proposal_sent", label: "Proposta inviata", color: "bg-orange-100 text-orange-800" },
  { value: "converted", label: "Convertito", color: "bg-emerald-100 text-emerald-800" },
  { value: "not_interested", label: "Non interessato", color: "bg-red-100 text-red-800" },
  { value: "not_reachable", label: "Non raggiungibile", color: "bg-gray-200 text-gray-700" },
]

const CATEGORY_LABELS: Record<string, string> = {
  hotel: "Hotel",
  "b&b": "B&B",
  agriturismo: "Agriturismo",
  residence: "Residence",
  camping: "Camping",
  ostello: "Ostello",
  casa_vacanze: "Casa Vacanze",
  altro: "Altro",
}

type Prospect = {
  id: string
  name: string
  category: string | null
  stars: number | null
  address: string | null
  city: string | null
  province: string | null
  region: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  google_place_id: string | null
  google_rating: number | null
  google_reviews_count: number | null
  rooms_count: number | null
  beds_count: number | null
  status: string
  notes: string | null
  last_contact_at: string | null
  assignment_date: string | null
  created_at: string
  agent: { id: string; display_name: string | null; email: string | null } | null
}

type LinkedDeal = {
  id: string
  prospect_name: string | null
  stage: string
  estimated_value: number | null
  probability: number | null
  last_activity_at: string | null
  created_at: string
}

const STAGE_LABELS: Record<string, string> = {
  qualified: "Qualificato",
  contacted: "Contattato",
  meeting: "Demo",
  proposal: "Proposta",
  negotiation: "Trattativa",
  won: "Vinto",
  lost: "Perso",
}

function formatRelative(d: string | null) {
  if (!d) return "-"
  const date = new Date(d)
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function ProspectDetailClient({ prospectId }: { prospectId: string }) {
  const { data, isLoading, error, mutate } = useSWR<{
    prospect: Prospect
    linked_deals: LinkedDeal[]
  }>(`/api/sales/prospects/${prospectId}`, fetcher)

  const [savingStatus, setSavingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)

  if (isLoading) return <DetailSkeleton />
  if (error || !data?.prospect) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {data && (data as any).error === "forbidden"
            ? "Non hai accesso a questa scheda."
            : "Prospect non trovato o errore di caricamento."}
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/sales/prospects">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Torna ai prospect
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const p = data.prospect
  const deals = data.linked_deals || []

  const statusInfo = STATUSES.find((s) => s.value === p.status)
  const categoryLabel = p.category ? CATEGORY_LABELS[p.category] || p.category : "-"
  const fullAddress = [p.address, p.postal_code, p.city, p.province && `(${p.province})`]
    .filter(Boolean)
    .join(", ")

  async function handleStatusChange(newStatus: string) {
    if (newStatus === p.status) return
    setSavingStatus(true)
    try {
      const res = await fetch("/api/sales/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore aggiornamento")
      toast.success("Stato aggiornato")
      mutate()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      const res = await fetch("/api/sales/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, notes: notesDraft }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore salvataggio")
      toast.success("Note salvate")
      setEditingNotes(false)
      mutate()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/sales/prospects"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tutti i miei prospect
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {p.name}
            {p.stars ? (
              <span className="inline-flex items-center gap-0.5 text-amber-500 text-base">
                {Array.from({ length: p.stars }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </span>
            ) : null}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span>{categoryLabel}</span>
            {p.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {p.city}
                {p.province && ` (${p.province})`}
              </span>
            )}
            {statusInfo && <Badge className={statusInfo.color}>{statusInfo.label}</Badge>}
            {(p as any).assignment_expires_at && (
              <ExpiryBadge expiresAt={(p as any).assignment_expires_at} />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/sales/pipeline?create_from_prospect=${p.id}`}>Crea deal</Link>
          </Button>
          <ReleaseProspectButton prospectId={p.id} prospectName={p.name} onReleased={() => {
            window.location.href = "/sales/prospects"
          }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column: timeline + activities */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes card */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Note interne</CardTitle>
              {!editingNotes ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNotesDraft(p.notes || "")
                    setEditingNotes(true)
                  }}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Modifica
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingNotes(false)}
                    disabled={savingNotes}
                  >
                    <X className="h-4 w-4 mr-1" /> Annulla
                  </Button>
                  <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Salva
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editingNotes ? (
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={5}
                  placeholder="Aggiungi note libere su questa struttura..."
                />
              ) : p.notes ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nessuna nota</p>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <ActivityTimeline prospectId={prospectId} />
        </div>

        {/* Side column: contacts, info, status, deals */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={p.status} onValueChange={handleStatusChange} disabled={savingStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Assegnato il</dt>
                  <dd>{formatRelative(p.assignment_date)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultimo contatto</dt>
                  <dd>{formatRelative(p.last_contact_at)}</dd>
                </div>
                {p.agent && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Venditore</dt>
                    <dd className="truncate max-w-[180px]">
                      {p.agent.display_name || p.agent.email}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contatti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              {p.phone ? (
                <a
                  href={`tel:${p.phone}`}
                  className="flex items-center gap-2 hover:text-emerald-600"
                >
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{p.phone}</span>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" /> -
                </div>
              )}
              {p.email ? (
                <a
                  href={`mailto:${p.email}`}
                  className="flex items-center gap-2 hover:text-emerald-600"
                >
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{p.email}</span>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" /> -
                </div>
              )}
              {p.website ? (
                <a
                  href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-emerald-600"
                >
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{p.website}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                </a>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 shrink-0" /> -
                </div>
              )}
              {fullAddress && (
                <div className="flex items-start gap-2 pt-2 border-t">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{fullAddress}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anagrafica</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Categoria</dt>
                  <dd>{categoryLabel}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Stelle</dt>
                  <dd>{p.stars ?? "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Camere</dt>
                  <dd>{p.rooms_count ?? "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Posti letto</dt>
                  <dd>{p.beds_count ?? "-"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Regione</dt>
                  <dd className="truncate max-w-[160px]">{p.region || "-"}</dd>
                </div>
                {p.google_rating !== null && (
                  <div className="flex justify-between border-t pt-2">
                    <dt className="text-muted-foreground">Google</dt>
                    <dd className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {p.google_rating.toFixed(1)}
                      {p.google_reviews_count
                        ? ` (${p.google_reviews_count})`
                        : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {deals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deal collegati</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deals.map((d) => (
                  <Link
                    key={d.id}
                    href={`/sales/pipeline?deal=${d.id}`}
                    className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {d.prospect_name || "Deal"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {STAGE_LABELS[d.stage] || d.stage}
                      </div>
                    </div>
                    {d.estimated_value !== null && (
                      <span className="text-xs font-medium tabular-nums">
                        € {Number(d.estimated_value).toLocaleString("it-IT")}
                      </span>
                    )}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-8 w-72 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  )
}
