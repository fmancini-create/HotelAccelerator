"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR, { mutate } from "swr"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ExpiryBadge } from "@/components/sales/expiry-badge"
import {
  Search,
  MapPin,
  Star,
  Phone,
  Mail,
  Globe,
  Loader2,
  Check,
  Clock,
  X,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type AgentState = "free" | "mine" | "taken" | "requested" | "rejected"

type SearchResult = {
  id: string
  name: string
  category: string | null
  stars: number | null
  city: string | null
  province: string | null
  region: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  assigned_agent_name: string | null
  assignment_expires_at: string | null
  agentState: AgentState
  last_request: {
    id: string
    status: string
    decision_notes: string | null
    created_at: string
    decided_at: string | null
  } | null
}

/**
 * Search bar per i venditori: cerca strutture nel database SANTADDEO e
 * permette di richiedere l'assegnazione al super admin.
 *
 * Comportamento:
 *  - Search live con debounce 300ms; minimum 2 char.
 *  - Mostra fino a 20 risultati con stato lato agente:
 *      free       -> "Richiedi assegnazione"
 *      mine       -> "Gia' tuo" (no azione)
 *      taken      -> "Assegnato a <agente>" (no azione)
 *      requested  -> "Richiesta inviata" + cancel
 *      rejected   -> "Rifiutata" + decision_notes + Riprova
 *  - Click su "Richiedi" apre dialog conferma con textarea messaggio opzionale.
 */
export function ProspectSearch() {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [openDropdown, setOpenDropdown] = useState(false)

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const swrKey = useMemo(
    () =>
      debouncedQuery.length >= 2
        ? `/api/sales/prospects/search?q=${encodeURIComponent(debouncedQuery)}`
        : null,
    [debouncedQuery],
  )
  const { data, isLoading, error } = useSWR<{
    results: SearchResult[]
    is_super_admin?: boolean
  }>(swrKey, fetcher)
  const isSuperAdmin = !!data?.is_super_admin

  // Click outside per chiudere dropdown
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const openRequestDialog = (p: SearchResult) => {
    setSelected(p)
    setMessage("")
    setRequestDialogOpen(true)
  }

  const submitRequest = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/sales/prospects/request-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: selected.id,
          message: message.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Errore nell'invio della richiesta")
        return
      }
      toast.success("Richiesta inviata al super admin")
      setRequestDialogOpen(false)
      // Ricarica risultati per aggiornare stato
      if (swrKey) mutate(swrKey)
      mutate("/api/sales/prospects/request-assignment?status=pending")
    } catch (err: any) {
      toast.error("Errore di rete: " + (err?.message || "sconosciuto"))
    } finally {
      setSubmitting(false)
    }
  }

  const cancelRequest = async (requestId: string) => {
    try {
      const res = await fetch(
        `/api/sales/prospects/request-assignment?id=${encodeURIComponent(requestId)}`,
        { method: "DELETE" },
      )
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Errore nella cancellazione")
        return
      }
      toast.success("Richiesta annullata")
      if (swrKey) mutate(swrKey)
      mutate("/api/sales/prospects/request-assignment?status=pending")
    } catch (err: any) {
      toast.error("Errore di rete: " + (err?.message || "sconosciuto"))
    }
  }

  const results = data?.results || []
  const showDropdown = openDropdown && debouncedQuery.length >= 2

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Cerca una struttura nel database (nome, citta', email, sito web)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpenDropdown(true)
            }}
            onFocus={() => setOpenDropdown(true)}
            className="pl-9 pr-9 h-11"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {!isLoading && query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setDebouncedQuery("")
                setOpenDropdown(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Cancella ricerca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showDropdown && (
          <Card className="absolute z-30 mt-2 w-full max-h-[60vh] overflow-y-auto p-0 shadow-lg">
            {isLoading && results.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                Sto cercando...
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-sm text-destructive">
                Errore nella ricerca
              </div>
            )}
            {!isLoading && !error && results.length === 0 && debouncedQuery.length >= 2 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nessun risultato per &quot;{debouncedQuery}&quot;
              </div>
            )}
            {results.length > 0 && (
              <ul className="divide-y">
                {results.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-4 p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{p.name}</span>
                        {p.stars && (
                          <span className="inline-flex items-center text-xs text-amber-600">
                            <Star className="h-3 w-3 fill-current mr-0.5" />
                            {p.stars}
                          </span>
                        )}
                        {p.category && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {p.category}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        {(p.city || p.province) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[p.city, p.province].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {p.email && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                            <Mail className="h-3 w-3" />
                            {p.email}
                          </span>
                        )}
                        {p.website && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                            <Globe className="h-3 w-3" />
                            {p.website.replace(/^https?:\/\//, "")}
                          </span>
                        )}
                        {p.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {p.phone}
                          </span>
                        )}
                      </div>
                      {p.agentState === "rejected" && p.last_request?.decision_notes && (
                        <div className="mt-1 text-xs text-rose-600 flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Motivo rifiuto: {p.last_request.decision_notes}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <ProspectStateAction
                        prospect={p}
                        isSuperAdmin={isSuperAdmin}
                        onRequest={() => openRequestDialog(p)}
                        onCancel={() => p.last_request && cancelRequest(p.last_request.id)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Richiedi assegnazione</DialogTitle>
            <DialogDescription>
              Stai chiedendo al super admin di assegnarti la struttura
              {selected ? ` "${selected.name}"` : ""}. Riceverai una notifica quando
              la richiesta verra' approvata o rifiutata.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{selected.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {[selected.city, selected.province, selected.region].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Messaggio per il super admin (opzionale)</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Es. ho un contatto diretto con il proprietario, gia' avviata trattativa..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)} disabled={submitting}>
              Annulla
            </Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Invia richiesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProspectStateAction({
  prospect,
  isSuperAdmin,
  onRequest,
  onCancel,
}: {
  prospect: SearchResult
  isSuperAdmin: boolean
  onRequest: () => void
  onCancel: () => void
}) {
  // Modalita' super_admin: niente richieste; mostriamo solo lo stato
  // attuale e (per i prospect non assegnati) un link rapido alla pagina
  // di assegnazione manuale.
  if (isSuperAdmin) {
    if (prospect.assigned_agent_name) {
      return (
        <Badge variant="secondary" className="text-xs">
          Assegnato a {prospect.assigned_agent_name}
        </Badge>
      )
    }
    return (
      <a
        href={`/superadmin/prospects?search=${encodeURIComponent(prospect.name)}`}
        className="inline-flex items-center text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
      >
        Assegna in superadmin
      </a>
    )
  }

  switch (prospect.agentState) {
    case "free":
      return (
        <Button size="sm" onClick={onRequest} className="bg-emerald-600 hover:bg-emerald-700">
          Richiedi assegnazione
        </Button>
      )
    case "mine":
      return (
        <div className="flex flex-col items-end gap-1">
          <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
            <Check className="h-3 w-3 mr-1" />
            Gia&apos; tuo
          </Badge>
          {prospect.assignment_expires_at && (
            <ExpiryBadge expiresAt={prospect.assignment_expires_at} />
          )}
        </div>
      )
    case "taken":
      return (
        <Badge variant="secondary" className="text-xs">
          Assegnato a {prospect.assigned_agent_name || "altro venditore"}
        </Badge>
      )
    case "requested":
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">
            <Clock className="h-3 w-3 mr-1" />
            In attesa
          </Badge>
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 px-2 text-xs">
            Annulla
          </Button>
        </div>
      )
    case "rejected":
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
            Rifiutata
          </Badge>
          <Button size="sm" variant="outline" onClick={onRequest} className="h-7 px-2 text-xs">
            Riprova
          </Button>
        </div>
      )
  }
}
