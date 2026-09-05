"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  ExternalLink,
  GitCompareArrows,
  Minus,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PLANS, formatPrice } from "@/lib/stripe-products"
import {
  CRM_COMPETITIVE_PRODUCTS,
  FEATURE_DEFINITIONS,
  STUDY_UPDATED_AT,
  featureStatus,
  type CrmCategory,
  type CrmCompetitiveProduct,
  type FeatureStatus,
} from "@/lib/platform/crm-competitive-study"

const statusMeta: Record<FeatureStatus, { label: string; icon: typeof Check; className: string }> = {
  yes: { label: "Sì", icon: Check, className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  partial: { label: "Parziale", icon: TriangleAlert, className: "text-amber-700 bg-amber-50 border-amber-200" },
  planned: { label: "Roadmap", icon: Sparkles, className: "text-blue-700 bg-blue-50 border-blue-200" },
  no: { label: "No", icon: Minus, className: "text-neutral-500 bg-neutral-50 border-neutral-200" },
}

function hotelAcceleratorPricing(): string[] {
  return PLANS.filter((plan) => plan.isActive).map((plan) => {
    if (plan.type === "commission") {
      return `${plan.name}: ${formatPrice(plan.basePriceInCents)}/mese + ${plan.commissionPercent ?? 0}% sul revenue incrementale`
    }
    if (plan.type === "fixed_fee") {
      return `${plan.name}: ${formatPrice(plan.perRoomPriceInCents ?? 0)}/camera/mese`
    }
    if (plan.type === "setup") {
      return `${plan.name}: ${formatPrice(plan.setupFeeInCents ?? 0)} una tantum`
    }
    return `${plan.name}: ${formatPrice(plan.basePriceInCents)}/mese`
  })
}

function score(product: CrmCompetitiveProduct) {
  return FEATURE_DEFINITIONS.reduce((total, feature) => {
    const status = featureStatus(product, feature.key)
    return total + (status === "yes" ? 1 : status === "partial" ? 0.5 : status === "planned" ? 0.25 : 0)
  }, 0)
}

function ProductSelect({
  value,
  onChange,
  excludeId,
}: {
  value: string
  onChange: (value: string) => void
  excludeId?: string
}) {
  const hospitality = CRM_COMPETITIVE_PRODUCTS.filter((p) => p.category === "Hospitality" && p.id !== excludeId)
  const general = CRM_COMPETITIVE_PRODUCTS.filter((p) => p.category === "Generalista" && p.id !== excludeId)

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
      aria-label="Seleziona CRM da confrontare"
    >
      <optgroup label="Hospitality">
        {hospitality.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </optgroup>
      <optgroup label="CRM generalisti">
        {general.map((product) => (
          <option key={product.id} value={product.id}>{product.name}</option>
        ))}
      </optgroup>
    </select>
  )
}

function PricePanel({ product }: { product: CrmCompetitiveProduct }) {
  const details = product.id === "hotelaccelerator" ? hotelAcceleratorPricing() : product.pricingDetails
  const summary = product.id === "hotelaccelerator" ? "Listino HotelAccelerator attivo nel codice" : product.pricingSummary

  return (
    <div className="rounded-xl border bg-neutral-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <CircleDollarSign className="h-4 w-4" /> Prezzo
      </div>
      <p className="mt-2 text-lg font-semibold text-neutral-950">{summary}</p>
      <ul className="mt-2 space-y-1 text-sm text-neutral-600">
        {details.map((detail) => <li key={detail}>• {detail}</li>)}
      </ul>
      {product.pricingCaveat && <p className="mt-2 text-xs text-amber-700">{product.pricingCaveat}</p>}
      {product.priceSourceUrl.startsWith("/") ? (
        <Link href={product.priceSourceUrl} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ha-brand hover:underline">
          {product.priceSourceLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : (
        <a href={product.priceSourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ha-brand hover:underline">
          {product.priceSourceLabel} <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

function ProductCard({ product }: { product: CrmCompetitiveProduct }) {
  return (
    <Card className={product.id === "hotelaccelerator" ? "border-ha-brand/40 shadow-sm" : "shadow-sm"}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{product.name}</CardTitle>
            <CardDescription className="mt-1">{product.positioning}</CardDescription>
          </div>
          <Badge variant="outline">{product.category}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PricePanel product={product} />
        <div>
          <div className="text-sm font-semibold text-neutral-900">Funzionalità principali</div>
          <ul className="mt-2 grid gap-1.5 text-sm text-neutral-600 sm:grid-cols-2">
            {product.keyFeatures.map((feature) => (
              <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{feature}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CompetitiveStudyPage() {
  const [leftId, setLeftId] = useState("hotelaccelerator")
  const [rightId, setRightId] = useState("mews")
  const [category, setCategory] = useState<"Tutte" | CrmCategory>("Tutte")
  const [query, setQuery] = useState("")
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  const left = CRM_COMPETITIVE_PRODUCTS.find((p) => p.id === leftId) ?? CRM_COMPETITIVE_PRODUCTS[0]
  const right = CRM_COMPETITIVE_PRODUCTS.find((p) => p.id === rightId) ?? CRM_COMPETITIVE_PRODUCTS[1]

  const groups = useMemo(() => {
    return [...new Set(FEATURE_DEFINITIONS.map((f) => f.group))]
  }, [])

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return CRM_COMPETITIVE_PRODUCTS.filter((product) => {
      if (category !== "Tutte" && product.category !== category) return false
      if (!needle) return true
      return [product.name, product.positioning, product.pricingSummary, ...product.keyFeatures]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [category, query])

  function swap() {
    setLeftId(right.id)
    setRightId(left.id)
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-screen-2xl p-4 sm:p-6">
        <Link href="/super-admin" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900">
          <ArrowLeft className="h-4 w-4" /> Torna al pannello
        </Link>

        <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ha-brand">
              <GitCompareArrows className="h-4 w-4" /> Intelligence competitiva
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950">Studio CRM e Hospitality</h1>
            <p className="mt-2 max-w-4xl text-sm text-neutral-600">
              Confronta due piattaforme alla volta per funzionalità, prezzo e posizionamento. HotelAccelerator è incluso nello stesso modello di confronto dei competitor.
            </p>
            <p className="mt-1 text-xs text-neutral-500">Ultimo aggiornamento dataset: {STUDY_UPDATED_AT}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border bg-white px-4 py-3"><div className="text-2xl font-semibold">{CRM_COMPETITIVE_PRODUCTS.length}</div><div className="text-xs text-neutral-500">prodotti</div></div>
            <div className="rounded-xl border bg-white px-4 py-3"><div className="text-2xl font-semibold">{FEATURE_DEFINITIONS.length}</div><div className="text-xs text-neutral-500">funzioni</div></div>
            <div className="rounded-xl border bg-white px-4 py-3"><div className="text-2xl font-semibold">2</div><div className="text-xs text-neutral-500">verticali</div></div>
          </div>
        </header>

        <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm sm:p-5" aria-label="Configurazione confronto">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">CRM A</label>
              <ProductSelect value={left.id} onChange={setLeftId} excludeId={right.id} />
            </div>
            <Button variant="outline" size="icon" onClick={swap} title="Scambia i CRM">
              <GitCompareArrows className="h-4 w-4" />
            </Button>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">CRM B</label>
              <ProductSelect value={right.id} onChange={setRightId} excludeId={left.id} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm text-neutral-600">
              Punteggio copertura: <strong className="text-neutral-900">{left.name} {score(left).toFixed(1)}</strong> vs <strong className="text-neutral-900">{right.name} {score(right).toFixed(1)}</strong> su {FEATURE_DEFINITIONS.length}.
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
              Mostra solo differenze
            </label>
          </div>
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <ProductCard product={left} />
          <ProductCard product={right} />
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-neutral-950">Matrice funzionalità</h2>
            <p className="mt-1 text-sm text-neutral-600">Sì = disponibile; Parziale = copertura incompleta/modulo/integrazione; Roadmap = prevista ma non production-ready; No = non rilevata.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="border-b text-left">
                  <th className="w-[42%] px-4 py-3 font-semibold text-neutral-600">Funzione</th>
                  <th className="w-[29%] px-4 py-3 font-semibold text-neutral-900">{left.name}</th>
                  <th className="w-[29%] px-4 py-3 font-semibold text-neutral-900">{right.name}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const features = FEATURE_DEFINITIONS.filter((f) => f.group === group).filter((f) => {
                    if (!onlyDifferences) return true
                    return featureStatus(left, f.key) !== featureStatus(right, f.key)
                  })
                  if (features.length === 0) return null
                  return [
                    <tr key={`${group}-title`} className="border-b bg-neutral-50/80">
                      <td colSpan={3} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-neutral-500">{group}</td>
                    </tr>,
                    ...features.map((feature) => {
                      const a = statusMeta[featureStatus(left, feature.key)]
                      const b = statusMeta[featureStatus(right, feature.key)]
                      const AIcon = a.icon
                      const BIcon = b.icon
                      return (
                        <tr key={feature.key} className="border-b last:border-b-0 hover:bg-neutral-50/60">
                          <td className="px-4 py-3 font-medium text-neutral-800">{feature.label}</td>
                          <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${a.className}`}><AIcon className="h-3.5 w-3.5" />{a.label}</span></td>
                          <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${b.className}`}><BIcon className="h-3.5 w-3.5" />{b.label}</span></td>
                        </tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Catalogo completo</h2>
              <p className="text-sm text-neutral-600">Tutti i CRM raccolti nello studio, pronti per essere caricati nel comparatore.</p>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca CRM o funzione..." className="pl-9" />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            {(["Tutte", "Hospitality", "Generalista"] as const).map((item) => (
              <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{product.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">{product.positioning}</CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0">{product.category}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-neutral-500">Prezzo</div>
                      <div className="text-sm font-semibold text-neutral-900">{product.id === "hotelaccelerator" ? "Listino interno" : product.pricingSummary}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => {
                      if (product.id === left.id) return
                      setRightId(product.id)
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}>
                      Confronta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4" /> Lettura strategica Hospitality</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-neutral-600">
              Il confronto deve distinguere tra PMS/operating system, CRM/CDP sopra il PMS e stack commerciali. HotelAccelerator compete soprattutto come layer operativo e commerciale sopra il gestionale esistente.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Lettura strategica CRM generalisti</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-neutral-600">
              HighLevel è il benchmark per multi-tenant/white-label, Creatio per configurabilità, HubSpot per customer platform, Pipedrive per semplicità, Close/Freshsales per comunicazioni native.
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
