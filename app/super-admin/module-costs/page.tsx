"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Loader2, UserRoundSearch } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OpenAICostsPanel } from "@/components/platform/openai-costs-panel"
import { toast } from "sonner"
import { MOLTIPLICATORE_PREZZO, formattaImporto } from "@/lib/modules/pricing"

interface CostoModulo {
  key: string
  name: string
  category: string
  monthlyCostCents: number | null
  monthlyPriceCents: number | null
  marginCents: number | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** Da "12,50" o "12.50" a 1250 centesimi. `null` se il campo e' vuoto. */
function euroInCentesimi(testo: string): number | null | "errore" {
  const pulito = testo.trim().replace(",", ".")
  if (pulito === "") return null
  const n = Number(pulito)
  if (!Number.isFinite(n) || n < 0) return "errore"
  return Math.round(n * 100)
}

export default function ModuleCostsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ items: CostoModulo[] }>(
    "/api/super-admin/module-costs",
    fetcher,
  )
  const [bozze, setBozze] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  async function salva(modulo: CostoModulo) {
    const testo = bozze[modulo.key] ?? ""
    const centesimi = euroInCentesimi(testo)
    if (centesimi === "errore") {
      toast.error("Scrivi un importo valido, per esempio 49,90. Lascia vuoto per togliere il costo.")
      return
    }

    setSalvando(modulo.key)
    try {
      const res = await fetch("/api/super-admin/module-costs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: modulo.key, monthlyCostCents: centesimi }),
      })
      const esito = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(esito?.error || "Salvataggio non riuscito")
        return
      }
      toast.success(
        centesimi === null
          ? `Costo rimosso da ${modulo.name}`
          : `${modulo.name}: costo ${formattaImporto(centesimi)}, prezzo ${formattaImporto(esito.item.monthlyPriceCents)}`,
      )
      setBozze((b) => {
        const { [modulo.key]: _rimosso, ...resto } = b
        return resto
      })
      await mutate()
    } catch {
      toast.error("Errore di rete: il costo non e stato salvato")
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto p-6">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Torna al pannello
        </Link>

        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">Costi della piattaforma</h1>
          <p className="mt-1 text-sm text-neutral-600 text-pretty">
            Qui il superadmin controlla separatamente i costi variabili dei provider e i costi fissi dei moduli.
            Gli importi interni non sono visibili alle strutture.
          </p>
        </header>

        <div className="space-y-4 mb-8">
          <OpenAICostsPanel />

          <Card className="border-ha-brand/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRoundSearch className="h-5 w-5 text-ha-brand" aria-hidden />
                HotelAccelerator Scout
              </CardTitle>
              <CardDescription>
                Scout non usa il costo mensile fisso: ha attivazione una tantum, crediti a consumo, costo provider storico e moltiplicatore dedicato.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-600">
                Gestisci costo per enrichment, ricarico, crediti inclusi, saldi tenant e margine.
              </p>
              <Button asChild>
                <Link href="/super-admin/scout-billing">Apri economics Scout</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="module-costs-title">
          <div className="mb-4">
            <h2 id="module-costs-title" className="text-lg font-semibold text-neutral-900">Costi fissi e prezzi dei moduli</h2>
            <p className="mt-1 text-sm text-neutral-600 text-pretty">
              Si scrive solo il <strong>costo</strong> che sosteniamo per ogni struttura. Il prezzo di vendita e{" "}
              {MOLTIPLICATORE_PREZZO === 2 ? "il doppio" : `${MOLTIPLICATORE_PREZZO} volte tanto`} e
              viene ricalcolato da solo: non esiste un secondo numero che possa restare indietro.
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              Caricamento moduli...
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">
              Non riesco a leggere i moduli. Ricarica la pagina.
            </p>
          )}

          {data?.items?.length === 0 && (
            <p className="text-sm text-neutral-600">Nessun modulo a pagamento in catalogo.</p>
          )}

          <div className="flex flex-col gap-4">
            {data?.items?.map((m) => {
              const inModifica = bozze[m.key] !== undefined
              const valore = inModifica
                ? bozze[m.key]
                : m.monthlyCostCents === null
                  ? ""
                  : (m.monthlyCostCents / 100).toFixed(2).replace(".", ",")

              return (
                <Card key={m.key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{m.name}</CardTitle>
                    <CardDescription>
                      {m.category === "addon" ? "Add-on" : "Prodotto"} · codice {m.key}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`costo-${m.key}`}>Costo mensile per struttura</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`costo-${m.key}`}
                            inputMode="decimal"
                            placeholder="vuoto = da definire"
                            className="w-44"
                            value={valore}
                            onChange={(e) => setBozze((b) => ({ ...b, [m.key]: e.target.value }))}
                          />
                          <span className="text-sm text-neutral-500">EUR</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Prezzo di vendita</span>
                        <span className="text-sm font-medium text-neutral-900">
                          {m.monthlyPriceCents === null
                            ? "da definire"
                            : `${formattaImporto(m.monthlyPriceCents)} al mese`}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-neutral-500">Margine</span>
                        <span className="text-sm text-neutral-700">
                          {m.marginCents === null ? "da definire" : formattaImporto(m.marginCents)}
                        </span>
                      </div>

                      <Button
                        onClick={() => salva(m)}
                        disabled={!inModifica || salvando === m.key}
                        className="ml-auto"
                      >
                        {salvando === m.key ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Salvataggio
                          </>
                        ) : (
                          "Salva"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
