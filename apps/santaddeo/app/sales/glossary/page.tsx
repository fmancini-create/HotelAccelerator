/**
 * /sales/glossary
 *
 * Pagina di consultazione delle terminologie alberghiere e dei termini
 * specifici della piattaforma SANTADDEO.
 *
 * Filtro per categoria + ricerca full-text su term, acronym, short e
 * long. Ogni voce e' espandibile per leggere descrizione lunga,
 * esempio e termini correlati. Cliccando un termine correlato la
 * pagina scrolla alla voce target.
 */

"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Search, BookOpen, X } from "lucide-react"
import { GLOSSARY, CATEGORIES, type GlossaryCategory } from "@/lib/sales/glossary-data"

// Slug stabile per gli anchor (cosi' i link "vedi anche" funzionano).
function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

const CATEGORY_COLORS: Record<GlossaryCategory, string> = {
  revenue: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ota: "bg-sky-100 text-sky-800 border-sky-200",
  operations: "bg-amber-100 text-amber-800 border-amber-200",
  pms: "bg-indigo-100 text-indigo-800 border-indigo-200",
  platform: "bg-rose-100 text-rose-800 border-rose-200",
  commerciale: "bg-violet-100 text-violet-800 border-violet-200",
}

export default function GlossaryPage() {
  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState<GlossaryCategory | "all">("all")

  // Filtro: combiniamo categoria + ricerca testuale (case-insensitive
  // e con normalizzazione accenti). La ricerca include anche acronym e
  // long, non solo il termine, cosi' "average daily rate" trova ADR.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return GLOSSARY.filter((entry) => {
      if (activeCategory !== "all" && entry.category !== activeCategory) return false
      if (!q) return true
      const haystack = [
        entry.term,
        entry.acronym ?? "",
        entry.short,
        entry.long ?? "",
        entry.example ?? "",
        entry.etymology ?? "",
        ...(entry.synonyms ?? []),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    }).sort((a, b) => a.term.localeCompare(b.term, "it"))
  }, [search, activeCategory])

  // Conteggi per categoria, mostrati nei chip filtro.
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: GLOSSARY.length }
    for (const c of CATEGORIES) {
      map[c.value] = GLOSSARY.filter((e) => e.category === c.value).length
    }
    return map
  }, [])

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <BookOpen className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Glossario</h1>
        </div>
        <p className="text-muted-foreground text-pretty max-w-3xl">
          Tutte le terminologie alberghiere e i termini della piattaforma SANTADDEO,
          con definizioni semplici, esempi pratici e collegamenti fra concetti.
          Strumento utile sia per i venditori in fase di formazione sia da consultare
          in chiamata con un prospect.
        </p>
      </div>

      {/* Toolbar: ricerca + filtri categoria */}
      <Card className="p-4 mb-6 border-border">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca un termine, un acronimo o una definizione..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Pulisci ricerca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={activeCategory === "all" ? "default" : "outline"}
            onClick={() => setActiveCategory("all")}
            className="gap-2"
          >
            Tutte
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {counts.all}
            </Badge>
          </Button>
          {CATEGORIES.map((c) => (
            <Button
              key={c.value}
              size="sm"
              variant={activeCategory === c.value ? "default" : "outline"}
              onClick={() => setActiveCategory(c.value)}
              className="gap-2"
              title={c.description}
            >
              {c.label}
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                {counts[c.value] ?? 0}
              </Badge>
            </Button>
          ))}
        </div>
      </Card>

      {/* Risultati */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <p className="text-muted-foreground">
            Nessun termine trovato per &quot;{search}&quot;.
          </p>
          <Button
            variant="link"
            onClick={() => {
              setSearch("")
              setActiveCategory("all")
            }}
          >
            Pulisci filtri
          </Button>
        </Card>
      ) : (
        <Card className="border-border">
          <Accordion type="multiple" className="divide-y divide-border">
            {filtered.map((entry) => {
              const id = slugify(entry.term)
              const categoryMeta = CATEGORIES.find((c) => c.value === entry.category)
              return (
                <AccordionItem key={id} value={id} id={id} className="border-0 px-4">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-start gap-3 flex-1 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-base">{entry.term}</span>
                          {entry.acronym && (
                            <span className="text-xs text-muted-foreground italic">
                              {entry.acronym}
                            </span>
                          )}
                          {entry.synonyms && entry.synonyms.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              = {entry.synonyms.join(", ")}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium border ${CATEGORY_COLORS[entry.category]}`}
                          >
                            {categoryMeta?.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {entry.short}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 space-y-4">
                    {entry.long && (
                      <p className="text-sm leading-relaxed text-foreground/90">
                        {entry.long}
                      </p>
                    )}
                    {entry.etymology && (
                      <div className="rounded-md bg-muted/50 border-l-2 border-sky-500 p-3">
                        <p className="text-xs font-semibold text-sky-700 mb-1 uppercase tracking-wide">
                          Etimologia
                        </p>
                        <p className="text-sm leading-relaxed">{entry.etymology}</p>
                      </div>
                    )}
                    {entry.synonyms && entry.synonyms.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Sinonimi:
                        </span>
                        {entry.synonyms.map((syn) => {
                          const target = GLOSSARY.find(
                            (g) => g.term.toLowerCase() === syn.toLowerCase(),
                          )
                          if (target) {
                            const targetId = slugify(target.term)
                            return (
                              <a
                                key={syn}
                                href={`#${targetId}`}
                                onClick={(e) => {
                                  e.preventDefault()
                                  const el = document.getElementById(targetId)
                                  if (el) {
                                    el.scrollIntoView({ behavior: "smooth", block: "center" })
                                    const trigger = el.querySelector(
                                      "[data-state]",
                                    ) as HTMLButtonElement | null
                                    if (trigger?.getAttribute("data-state") === "closed") {
                                      trigger.click()
                                    }
                                  }
                                }}
                              >
                                <Badge
                                  variant="outline"
                                  className="text-xs hover:bg-muted cursor-pointer"
                                >
                                  {target.term}
                                </Badge>
                              </a>
                            )
                          }
                          return (
                            <Badge key={syn} variant="secondary" className="text-xs">
                              {syn}
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                    {entry.example && (
                      <div className="rounded-md bg-muted/50 border-l-2 border-emerald-500 p-3">
                        <p className="text-xs font-semibold text-emerald-700 mb-1 uppercase tracking-wide">
                          Esempio
                        </p>
                        <p className="text-sm leading-relaxed">{entry.example}</p>
                      </div>
                    )}
                    {entry.related && entry.related.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Vedi anche:
                        </span>
                        {entry.related.map((rel) => {
                          const target = GLOSSARY.find(
                            (g) => g.term.toLowerCase() === rel.toLowerCase(),
                          )
                          if (!target) {
                            return (
                              <Badge key={rel} variant="secondary" className="text-xs">
                                {rel}
                              </Badge>
                            )
                          }
                          const targetId = slugify(target.term)
                          return (
                            <a
                              key={rel}
                              href={`#${targetId}`}
                              className="inline-flex items-center"
                              onClick={(e) => {
                                // Forza apertura della voce target dopo lo scroll.
                                e.preventDefault()
                                const el = document.getElementById(targetId)
                                if (el) {
                                  el.scrollIntoView({ behavior: "smooth", block: "center" })
                                  // Trigger click sull'accordion trigger interno.
                                  const trigger = el.querySelector(
                                    "[data-state]",
                                  ) as HTMLButtonElement | null
                                  if (trigger?.getAttribute("data-state") === "closed") {
                                    trigger.click()
                                  }
                                }
                              }}
                            >
                              <Badge
                                variant="outline"
                                className="text-xs hover:bg-muted cursor-pointer"
                              >
                                {target.term}
                              </Badge>
                            </a>
                          )
                        })}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center mt-6">
        {filtered.length} {filtered.length === 1 ? "termine" : "termini"} su {GLOSSARY.length} totali
      </p>
    </div>
  )
}
