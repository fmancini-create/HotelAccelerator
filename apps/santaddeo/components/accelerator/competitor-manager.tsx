"use client"

import { useState } from "react"
import { Plus, Trash2, Loader2, Building2, Search, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface Competitor {
  id: string
  name: string
  external_ref: string | null
  provider: string
  channel: string | null
  active: boolean
  created_at: string
}

// Tenuto allineato a MAX_COMPETITORS nella route /competitors.
const MAX_COMPETITORS = 6

export function CompetitorManager({
  hotelId,
  competitors,
  occupancy,
  onChanged,
}: {
  hotelId: string
  competitors: Competitor[]
  occupancy: number
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)

  const atLimit = competitors.length >= MAX_COMPETITORS

  // inserimento prezzi
  const [priceCompetitor, setPriceCompetitor] = useState("")
  const [priceFrom, setPriceFrom] = useState("")
  const [priceTo, setPriceTo] = useState("")
  const [priceValue, setPriceValue] = useState("")
  const [savingPrice, setSavingPrice] = useState(false)

  // CSV
  const [csv, setCsv] = useState("")
  const [importingCsv, setImportingCsv] = useState(false)

  // ricerca Google Hotels
  const [gQuery, setGQuery] = useState("")
  const [gSearching, setGSearching] = useState(false)
  const [gResults, setGResults] = useState<
    Array<{ token: string; name: string; type: string | null; hotelClass: string | null; rate: number | null }>
  >([])
  const [gAddingToken, setGAddingToken] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function searchGoogle() {
    if (!gQuery.trim()) return
    setGSearching(true)
    setGResults([])
    try {
      const res = await fetch(
        `/api/accelerator/rate-shopper/search?hotelId=${hotelId}&q=${encodeURIComponent(gQuery.trim())}`,
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore")
      setGResults(body.results || [])
      if ((body.results || []).length === 0) toast.info("Nessun risultato su Google Hotels")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGSearching(false)
    }
  }

  async function addGoogleCompetitor(token: string, name: string) {
    if (atLimit) {
      toast.info(`Puoi monitorare al massimo ${MAX_COMPETITORS} competitor`)
      return
    }
    setGAddingToken(token)
    try {
      const res = await fetch("/api/accelerator/rate-shopper/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, name, provider: "serpapi", externalRef: token, channel: "google_hotels" }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      toast.success(`${name} aggiunto al comp set`)
      setGResults((prev) => prev.filter((r) => r.token !== token))
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGAddingToken(null)
    }
  }

  async function refreshNow() {
    setRefreshing(true)
    try {
      const res = await fetch("/api/accelerator/rate-shopper/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, days: 60, occupancy }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore")
      if (body.pulled > 0) {
        toast.success(`Prezzi aggiornati: ${body.withPrice ?? body.pulled} rilevazioni`)
      } else {
        toast.info(body.note || "Nessun prezzo aggiornato")
      }
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  async function addCompetitor() {
    if (!newName.trim()) return
    if (atLimit) {
      toast.info(`Puoi monitorare al massimo ${MAX_COMPETITORS} competitor`)
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/accelerator/rate-shopper/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, name: newName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      setNewName("")
      toast.success("Competitor aggiunto")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function removeCompetitor(id: string) {
    try {
      const res = await fetch(`/api/accelerator/rate-shopper/competitors/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Errore")
      toast.success("Competitor rimosso")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function savePrices() {
    if (!priceCompetitor || !priceFrom || !priceValue) {
      toast.error("Competitor, data e prezzo richiesti")
      return
    }
    const from = priceFrom
    const to = priceTo || priceFrom
    if (to < from) {
      toast.error("La data finale precede quella iniziale")
      return
    }
    setSavingPrice(true)
    try {
      const rows: Array<{ competitorId: string; stayDate: string; price: number; occupancy: number }> = []
      const d = new Date(from + "T00:00:00Z")
      const endD = new Date(to + "T00:00:00Z")
      while (d <= endD) {
        rows.push({
          competitorId: priceCompetitor,
          stayDate: d.toISOString().slice(0, 10),
          price: Number(priceValue),
          occupancy,
        })
        d.setUTCDate(d.getUTCDate() + 1)
      }
      const res = await fetch("/api/accelerator/rate-shopper/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, rows }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore")
      toast.success(`${body.inserted} prezzi salvati`)
      setPriceValue("")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingPrice(false)
    }
  }

  // CSV: righe "nome_competitor,YYYY-MM-DD,prezzo"
  async function importCsv() {
    const lines = csv
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      toast.error("Nessuna riga da importare")
      return
    }
    const byName = new Map(competitors.map((c) => [c.name.toLowerCase(), c.id]))
    const rows: Array<{ competitorId: string; stayDate: string; price: number; occupancy: number }> = []
    const errors: string[] = []
    for (const line of lines) {
      const [name, date, price] = line.split(/[,;]/).map((s) => s.trim())
      const id = byName.get((name || "").toLowerCase())
      if (!id) {
        errors.push(`competitor "${name}" non trovato`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
        errors.push(`data "${date}" non valida`)
        continue
      }
      rows.push({ competitorId: id, stayDate: date, price: Number(price), occupancy })
    }
    if (rows.length === 0) {
      toast.error(errors[0] || "Nessuna riga valida")
      return
    }
    setImportingCsv(true)
    try {
      const res = await fetch("/api/accelerator/rate-shopper/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, rows }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Errore")
      toast.success(`${body.inserted} prezzi importati${errors.length ? `, ${errors.length} righe ignorate` : ""}`)
      setCsv("")
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImportingCsv(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Gestisci comp set
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Comp set & prezzi</DialogTitle>
          <DialogDescription>
            Gestisci i competitor e inserisci i loro prezzi (occupanza {occupancy} ospiti).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="google">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="google">Google</TabsTrigger>
            <TabsTrigger value="competitors">Manuali</TabsTrigger>
            <TabsTrigger value="prices">Prezzi</TabsTrigger>
            <TabsTrigger value="csv">CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="google" className="space-y-4 pt-2">
            {atLimit ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                Hai raggiunto il massimo di {MAX_COMPETITORS} competitor. Rimuovine uno (tab Manuali) per aggiungerne un
                altro.
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="g-q">Cerca su Google Hotels</Label>
                <Input
                  id="g-q"
                  value={gQuery}
                  onChange={(e) => setGQuery(e.target.value)}
                  placeholder="Es. Hotel Bellavista Rimini"
                  onKeyDown={(e) => e.key === "Enter" && searchGoogle()}
                />
              </div>
              <Button onClick={searchGoogle} disabled={gSearching}>
                {gSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {gResults.length > 0 && (
              <ul className="divide-y rounded-md border">
                {gResults.map((r) => (
                  <li key={r.token} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[r.type, r.hotelClass, r.rate != null ? `da ${r.rate} €` : null].filter(Boolean).join(" · ") ||
                          "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addGoogleCompetitor(r.token, r.name)}
                      disabled={gAddingToken === r.token || atLimit}
                    >
                      {gAddingToken === r.token ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                I competitor aggiunti da Google Hotels vengono aggiornati automaticamente. Usa &ldquo;Aggiorna prezzi
                ora&rdquo; per una rilevazione immediata dei prossimi 60 giorni.
              </p>
              <Button
                className="mt-2 w-full"
                variant="secondary"
                onClick={refreshNow}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Aggiorna prezzi ora
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="competitors" className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Comp set</h4>
              <span className={`text-xs ${atLimit ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {competitors.length}/{MAX_COMPETITORS} competitor
              </span>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="comp-name">Nuovo competitor</Label>
                <Input
                  id="comp-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Es. Hotel Bellavista"
                  disabled={atLimit}
                  onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                />
              </div>
              <Button onClick={addCompetitor} disabled={adding || atLimit}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {atLimit ? (
              <p className="text-xs text-muted-foreground">
                Hai raggiunto il massimo di {MAX_COMPETITORS} competitor. Rimuovine uno per aggiungerne un altro.
              </p>
            ) : null}
            <ul className="divide-y rounded-md border">
              {competitors.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">Nessun competitor nel comp set.</li>
              ) : (
                competitors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between p-3 text-sm">
                    <span className="flex items-center gap-2">
                      {c.name}
                      {c.provider === "serpapi" && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          Google
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCompetitor(c.id)}
                      aria-label={`Rimuovi ${c.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </TabsContent>

          <TabsContent value="prices" className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label>Competitor</Label>
              <Select value={priceCompetitor} onValueChange={setPriceCompetitor}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  {competitors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="p-from">Dal</Label>
                <Input id="p-from" type="date" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-to">Al (opz.)</Label>
                <Input id="p-to" type="date" value={priceTo} onChange={(e) => setPriceTo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-val">Prezzo per notte (€)</Label>
              <Input
                id="p-val"
                type="number"
                min={0}
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                placeholder="Es. 180"
              />
            </div>
            <Button className="w-full" onClick={savePrices} disabled={savingPrice}>
              {savingPrice ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salva prezzi
            </Button>
          </TabsContent>

          <TabsContent value="csv" className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="csv">Incolla CSV</Label>
              <p className="text-xs text-muted-foreground">
                Una riga per prezzo: <code>nome competitor,YYYY-MM-DD,prezzo</code>
              </p>
              <Textarea
                id="csv"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={6}
                placeholder={"Hotel Bellavista,2026-07-12,180\nHotel Bellavista,2026-07-13,195"}
                className="font-mono text-xs"
              />
            </div>
            <Button className="w-full" onClick={importCsv} disabled={importingCsv}>
              {importingCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Importa CSV
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
