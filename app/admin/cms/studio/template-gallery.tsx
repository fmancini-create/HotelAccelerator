"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TemplatePreview, type StudioTemplate } from "./template-preview"

const categoryLabels: Record<string, string> = {
  all: "Tutte",
  luxury: "Luxury",
  boutique: "Boutique",
  wellness: "Wellness",
  family: "Family",
  business: "Business",
  country: "Country",
  bnb: "B&B",
  mountain: "Montagna",
  holiday_home: "Case vacanze",
}

const keywordCategoryMap: Array<{ terms: string[]; category: string }> = [
  { terms: ["lusso", "luxury", "5 stelle", "villa", "dimora storica", "resort"], category: "luxury" },
  { terms: ["boutique", "design", "romantico", "charme"], category: "boutique" },
  { terms: ["spa", "benessere", "wellness", "terme", "retreat"], category: "wellness" },
  { terms: ["famiglia", "family", "bambini", "villaggio"], category: "family" },
  { terms: ["business", "meeting", "aeroporto", "city hotel"], category: "business" },
  { terms: ["agriturismo", "country", "vino", "wine resort", "campagna"], category: "country" },
  { terms: ["b&b", "bed and breakfast", "guest house", "affittacamere"], category: "bnb" },
  { terms: ["montagna", "chalet", "ski", "alpine", "dolomiti"], category: "mountain" },
  { terms: ["casa vacanze", "appartamento", "residence", "villa in affitto"], category: "holiday_home" },
]

function recommendationScore(template: StudioTemplate, profile: string) {
  const source = `${template.name} ${template.collection} ${template.description} ${template.idealFor.join(" ")} ${template.features.join(" ")}`.toLowerCase()
  const normalized = profile.toLowerCase()
  let score = 0
  for (const token of normalized.split(/\W+/).filter((value) => value.length > 2)) if (source.includes(token)) score += 2
  for (const entry of keywordCategoryMap) if (entry.terms.some((term) => normalized.includes(term)) && template.category === entry.category) score += 12
  if (normalized.includes("moderno") && ["minimal", "conversion"].includes(template.layout)) score += 4
  if ((normalized.includes("elegante") || normalized.includes("classico")) && ["classic", "editorial"].includes(template.layout)) score += 4
  if ((normalized.includes("fotografie") || normalized.includes("immagini grandi")) && ["immersive", "editorial"].includes(template.layout)) score += 4
  return score
}

export function TemplateGallery({
  templates,
  selectedId,
  onSelect,
  profile,
  onProfileChange,
}: {
  templates: StudioTemplate[]
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
      return `${template.name} ${template.collection} ${template.description} ${template.idealFor.join(" ")} ${template.features.join(" ")}`.toLowerCase().includes(normalized)
    })
  }, [templates, category, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, StudioTemplate[]>()
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
      <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-2">
          <p className="text-sm font-medium">Descrivi la tua struttura</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={profileValue} onChange={(event) => updateProfile(event.target.value)} placeholder="Es. Hotel 4 stelle con spa, 28 camere, Lago di Garda, stile elegante" />
            <Button type="button" onClick={recommend} disabled={!profileValue.trim()}><Sparkles className="mr-2 h-4 w-4" />Consigliami</Button>
          </div>
          <p className="text-xs text-muted-foreground">Il layout applicato genera già pagine e priorità coerenti con la propria collezione. La personalizzazione completa usa anche le indicazioni degli step successivi.</p>
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
            {items.map((template) => <button key={template.id} type="button" onClick={() => onSelect(template.id)} className="relative text-left">
              {recommendedIds.includes(template.id) && <span className="absolute right-3 top-3 z-20 rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[.15em] text-white">Consigliato</span>}
              <TemplatePreview template={template} selected={selectedId === template.id} />
            </button>)}
          </div>
        </section>
      ))}
    </div>
  )
}
