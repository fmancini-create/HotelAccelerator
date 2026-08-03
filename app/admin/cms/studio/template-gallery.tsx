"use client"

import { useMemo, useState } from "react"
import { Info, Search, Sparkles, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TemplatePreview, type StudioTemplate } from "./template-preview"

type GuidedTemplate = StudioTemplate & {
  designObjective?: "brand" | "storytelling" | "conversion" | "services" | "catalog"
  guidance?: {
    promise: string
    prioritizes: string
    tradeoff: string
    result: string
  }
}

const categoryLabels: Record<string, string> = {
  all: "Tutte",
  luxury: "Luxury",
  boutique: "Boutique",
  wellness: "Wellness",
  family: "Family",
  business: "Business",
  country: "Country",
  "bed-breakfast": "B&B",
  mountain: "Montagna",
  "holiday-home": "Case vacanze",
}

const objectiveLabels: Record<string, string> = {
  brand: "Immagine e posizionamento",
  storytelling: "Racconto ed emozione",
  conversion: "Prenotazione diretta",
  services: "Servizi e chiarezza",
  catalog: "Ricerca e confronto alloggi",
}

const keywordCategoryMap: Array<{ terms: string[]; category: string }> = [
  { terms: ["lusso", "luxury", "5 stelle", "villa", "dimora storica", "resort"], category: "luxury" },
  { terms: ["boutique", "design", "romantico", "charme"], category: "boutique" },
  { terms: ["spa", "benessere", "wellness", "terme", "retreat"], category: "wellness" },
  { terms: ["famiglia", "family", "bambini", "villaggio"], category: "family" },
  { terms: ["business", "meeting", "aeroporto", "city hotel"], category: "business" },
  { terms: ["agriturismo", "country", "vino", "wine resort", "campagna"], category: "country" },
  { terms: ["b&b", "bed and breakfast", "guest house", "affittacamere"], category: "bed-breakfast" },
  { terms: ["montagna", "chalet", "ski", "alpine", "dolomiti"], category: "mountain" },
  { terms: ["casa vacanze", "appartamento", "residence", "villa in affitto"], category: "holiday-home" },
]

function recommendationScore(template: GuidedTemplate, profile: string) {
  const source = `${template.name} ${template.collection} ${template.description} ${template.idealFor.join(" ")} ${template.features.join(" ")} ${template.guidance?.prioritizes || ""}`.toLowerCase()
  const normalized = profile.toLowerCase()
  let score = 0
  for (const token of normalized.split(/\W+/).filter((value) => value.length > 2)) if (source.includes(token)) score += 2
  for (const entry of keywordCategoryMap) if (entry.terms.some((term) => normalized.includes(term)) && template.category === entry.category) score += 12
  if (normalized.includes("moderno") && ["minimal", "conversion"].includes(template.layout)) score += 4
  if ((normalized.includes("elegante") || normalized.includes("classico")) && ["classic", "editorial"].includes(template.layout)) score += 4
  if ((normalized.includes("fotografie") || normalized.includes("immagini grandi")) && ["immersive", "editorial"].includes(template.layout)) score += 4
  if ((normalized.includes("prenotazione") || normalized.includes("conversione") || normalized.includes("ota")) && template.designObjective === "conversion") score += 8
  return score
}

export function TemplateGallery({
  templates,
  selectedId,
  onSelect,
  profile,
  onProfileChange,
}: {
  templates: GuidedTemplate[]
  selectedId: string
  onSelect: (id: string) => void
  profile?: string
  onProfileChange?: (profile: string) => void
}) {
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [localProfile, setLocalProfile] = useState("")
  const [recommendedIds, setRecommendedIds] = useState<string[]>([])
  const profileValue = profile ?? localProfile

  function updateProfile(value: string) {
    const normalized = value.slice(0, 5000)
    if (onProfileChange) onProfileChange(normalized)
    else setLocalProfile(normalized)
  }

  const categories = useMemo(() => ["all", ...Array.from(new Set(templates.map((template) => template.category)))], [templates])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return templates.filter((template) => {
      if (category !== "all" && template.category !== category) return false
      if (!normalized) return true
      return `${template.name} ${template.collection} ${template.description} ${template.idealFor.join(" ")} ${template.features.join(" ")} ${template.guidance?.prioritizes || ""}`.toLowerCase().includes(normalized)
    })
  }, [templates, category, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, GuidedTemplate[]>()
    for (const template of visible) groups.set(template.collection, [...(groups.get(template.collection) || []), template])
    return Array.from(groups.entries())
  }, [visible])

  function recommend() {
    const ranked = templates
      .map((template) => ({ id: template.id, score: recommendationScore(template, profileValue) }))
      .sort((a, b) => b.score - a.score)
      .filter((item) => item.score > 0)
      .slice(0, 4)
    setRecommendedIds(ranked.map((item) => item.id))
    if (ranked[0]) onSelect(ranked[0].id)
  }

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Non stai scegliendo soltanto colori e fotografie.</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Ogni modello determina come il sito presenta la struttura, quali contenuti mostra per primi e quanto spinge la prenotazione. Leggi obiettivo e compromesso prima di scegliere.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Descrivi la tua struttura</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={profileValue} onChange={(event) => updateProfile(event.target.value)} placeholder="Es. Hotel 4 stelle con spa, 28 camere, Lago di Garda, stile elegante" />
            <Button type="button" onClick={recommend} disabled={!profileValue.trim()}><Sparkles className="mr-2 h-4 w-4" />Consigliami</Button>
          </div>
          <p className="text-xs text-muted-foreground">Il consiglio considera tipologia, stile e priorità commerciali. La scelta resta sempre modificabile.</p>
        </div>
        <div className="relative min-w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Cerca template" /></div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((item) => <Button key={item} type="button" size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)} className="shrink-0">{categoryLabels[item] || item}</Button>)}
      </div>

      {grouped.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nessun template corrisponde ai filtri.</div> : grouped.map(([collection, items]) => (
        <section key={collection} className="space-y-4">
          <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Collection</p><h3 className="font-serif text-3xl">{collection}</h3></div><p className="text-sm text-muted-foreground">{items.length} layout</p></div>
          <div className="grid gap-6 xl:grid-cols-2">
            {items.map((template) => (
              <button key={template.id} type="button" onClick={() => onSelect(template.id)} className="relative overflow-hidden rounded-xl text-left transition hover:-translate-y-0.5">
                {recommendedIds.includes(template.id) && <span className="absolute right-3 top-3 z-20 rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[.15em] text-white">Consigliato</span>}
                <TemplatePreview template={template} selected={selectedId === template.id} />
                {template.guidance && (
                  <div className={`border border-t-0 p-5 ${selectedId === template.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" />{objectiveLabels[template.designObjective || ""] || "Impostazione del sito"}</div>
                    <div className="grid gap-4 text-xs leading-5 sm:grid-cols-3">
                      <div><p className="font-semibold text-foreground">Privilegia</p><p className="mt-1 text-muted-foreground">{template.guidance.prioritizes}</p></div>
                      <div><p className="font-semibold text-foreground">Da sapere</p><p className="mt-1 text-muted-foreground">{template.guidance.tradeoff}</p></div>
                      <div><p className="font-semibold text-foreground">Risultato</p><p className="mt-1 text-muted-foreground">{template.guidance.result}</p></div>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
