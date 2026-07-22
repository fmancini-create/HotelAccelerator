/**
 * /sales/playbook — Disco Vendita
 *
 * Strumento operativo per i venditori SANTADDEO. Quattro sezioni:
 *  - Domande di scoperta (cosa chiedere all'albergatore + come agganciare il valore)
 *  - Gestione obiezioni (obiezione + risposta consigliata, filtrabili per categoria)
 *  - Traccia del pitch a fasi (apertura -> chiusura)
 *  - Frasi pronte da copiare al volo
 *
 * Ogni blocco testuale ha un'audio guida con voce neurale realistica
 * (OpenAI TTS via /api/sales/tts, MP3 in cache su Blob) cosi' il venditore
 * puo' ripassare anche solo ascoltando.
 *
 * Contenuti statici da lib/sales/playbook-data.ts (stesso pattern del glossario).
 */

"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { SpeechButton } from "@/components/sales/speech-button"
import {
  Search,
  X,
  Headphones,
  HelpCircle,
  ShieldQuestion,
  ListOrdered,
  MessageSquareQuote,
  Copy,
  Check,
  ThumbsUp,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import {
  DISCOVERY,
  OBJECTIONS,
  OBJECTION_CATEGORIES,
  PITCH,
  PHRASES,
  PHRASE_CONTEXTS,
  type PlaybookSection,
  type ObjectionCategory,
  type PhraseContext,
} from "@/lib/sales/playbook-data"

function matches(q: string, ...fields: (string | undefined)[]) {
  if (!q) return true
  const hay = fields.filter(Boolean).join(" ").toLowerCase()
  return hay.includes(q)
}

export default function PlaybookPage() {
  const [section, setSection] = useState<PlaybookSection>("discovery")
  const [search, setSearch] = useState("")
  const [objCat, setObjCat] = useState<ObjectionCategory | "all">("all")
  const [phraseCtx, setPhraseCtx] = useState<PhraseContext | "all">("all")

  const q = search.trim().toLowerCase()

  const discovery = useMemo(
    () => DISCOVERY.filter((d) => matches(q, d.question, d.why, d.goodAnswer, d.redFlag, d.bridge)),
    [q],
  )
  const objections = useMemo(
    () =>
      OBJECTIONS.filter((o) => objCat === "all" || o.category === objCat).filter((o) =>
        matches(q, o.objection, o.response, o.tip),
      ),
    [q, objCat],
  )
  const pitch = useMemo(
    () => PITCH.filter((p) => matches(q, p.phase, p.goal, p.script, p.tips.join(" "))),
    [q],
  )
  const phrases = useMemo(
    () =>
      PHRASES.filter((p) => phraseCtx === "all" || p.context === phraseCtx).filter((p) =>
        matches(q, p.text),
      ),
    [q, phraseCtx],
  )

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Headphones className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Disco Vendita</h1>
        </div>
        <p className="text-muted-foreground text-pretty max-w-3xl leading-relaxed">
          La cassetta degli attrezzi per vendere SANTADDEO: cosa chiedere all&apos;albergatore,
          come rispondere alle obiezioni, lo script della chiamata a fasi e le frasi pronte
          all&apos;uso. Ogni blocco ha l&apos;audio guida: premi{" "}
          <span className="inline-flex items-center gap-1 align-middle text-foreground">
            <Headphones className="h-3.5 w-3.5" /> Ascolta
          </span>{" "}
          per ripassarlo in voce, anche in auto prima dell&apos;appuntamento.
        </p>
      </div>

      {/* Ricerca */}
      <Card className="p-4 mb-6 border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca in tutto il disco vendita (domande, obiezioni, frasi)..."
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
      </Card>

      <Tabs value={section} onValueChange={(v) => setSection(v as PlaybookSection)}>
        <TabsList className="mb-6 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="discovery" className="gap-2">
            <HelpCircle className="h-4 w-4" /> Scoperta
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {DISCOVERY.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="objections" className="gap-2">
            <ShieldQuestion className="h-4 w-4" /> Obiezioni
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {OBJECTIONS.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="pitch" className="gap-2">
            <ListOrdered className="h-4 w-4" /> Pitch
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {PITCH.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="phrases" className="gap-2">
            <MessageSquareQuote className="h-4 w-4" /> Frasi
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {PHRASES.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ───────────────── SCOPERTA ───────────────── */}
        <TabsContent value="discovery" className="mt-0">
          <SectionIntro>
            Domande da fare all&apos;albergatore per capire come lavora oggi e far emergere il
            valore di SANTADDEO. Per ognuna trovi <em>perche&apos; la fai</em>, la risposta ideale,
            il campanello d&apos;allarme e come agganciare il valore.
          </SectionIntro>
          {discovery.length === 0 ? (
            <EmptyState onReset={() => setSearch("")} search={search} />
          ) : (
            <Card className="border-border">
              <Accordion type="multiple" className="divide-y divide-border">
                {discovery.map((d) => (
                  <AccordionItem key={d.id} value={d.id} className="border-0 px-4">
                    <AccordionTrigger className="hover:no-underline py-4 text-left">
                      <span className="font-semibold text-base pr-4">{d.question}</span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 space-y-3">
                      <div className="flex justify-end">
                        <SpeechButton
                          label="la domanda"
                          text={`${d.question}. Perche' la fai: ${d.why}. Come agganciare il valore: ${d.bridge}`}
                        />
                      </div>
                      <InfoBlock color="sky" title="Perche' la fai">
                        {d.why}
                      </InfoBlock>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <InfoBlock color="emerald" title="Risposta ideale" icon={<ThumbsUp className="h-3.5 w-3.5" />}>
                          {d.goodAnswer}
                        </InfoBlock>
                        <InfoBlock color="amber" title="Campanello d'allarme" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                          {d.redFlag}
                        </InfoBlock>
                      </div>
                      <InfoBlock color="indigo" title="Come agganci il valore" icon={<ArrowRight className="h-3.5 w-3.5" />}>
                        {d.bridge}
                      </InfoBlock>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          )}
        </TabsContent>

        {/* ───────────────── OBIEZIONI ───────────────── */}
        <TabsContent value="objections" className="mt-0">
          <SectionIntro>
            Le obiezioni piu&apos; comuni dell&apos;albergatore e la risposta consigliata per
            ribattere con sicurezza. Filtra per tipo di obiezione.
          </SectionIntro>
          <div className="flex flex-wrap gap-2 mb-4">
            <FilterChip active={objCat === "all"} onClick={() => setObjCat("all")} count={OBJECTIONS.length}>
              Tutte
            </FilterChip>
            {OBJECTION_CATEGORIES.map((c) => (
              <FilterChip
                key={c.value}
                active={objCat === c.value}
                onClick={() => setObjCat(c.value)}
                count={OBJECTIONS.filter((o) => o.category === c.value).length}
              >
                {c.label}
              </FilterChip>
            ))}
          </div>
          {objections.length === 0 ? (
            <EmptyState onReset={() => { setSearch(""); setObjCat("all") }} search={search} />
          ) : (
            <Card className="border-border">
              <Accordion type="multiple" className="divide-y divide-border">
                {objections.map((o) => {
                  const catLabel = OBJECTION_CATEGORIES.find((c) => c.value === o.category)?.label
                  return (
                    <AccordionItem key={o.id} value={o.id} className="border-0 px-4">
                      <AccordionTrigger className="hover:no-underline py-4 text-left">
                        <div className="flex items-start gap-3 flex-1 pr-4">
                          <span className="text-muted-foreground mt-0.5">&ldquo;</span>
                          <span className="font-semibold text-base flex-1">{o.objection}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {catLabel}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 space-y-3">
                        <div className="flex justify-end">
                          <SpeechButton label="la risposta" text={o.response.replace(/["]/g, "")} />
                        </div>
                        <InfoBlock color="emerald" title="Risposta consigliata">
                          {o.response}
                        </InfoBlock>
                        {o.tip && (
                          <InfoBlock color="sky" title="Consiglio tattico">
                            {o.tip}
                          </InfoBlock>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </Card>
          )}
        </TabsContent>

        {/* ───────────────── PITCH ───────────────── */}
        <TabsContent value="pitch" className="mt-0">
          <SectionIntro>
            Lo script della chiamata, fase per fase. Adattalo alle tue parole: e&apos; una traccia,
            non un copione da recitare.
          </SectionIntro>
          {pitch.length === 0 ? (
            <EmptyState onReset={() => setSearch("")} search={search} />
          ) : (
            <div className="space-y-4">
              {pitch.map((p) => (
                <Card key={p.id} className="p-5 border-border">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{p.phase}</h3>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.goal}</p>
                    </div>
                    <SpeechButton
                      size="icon"
                      label={p.phase}
                      text={`${p.phase}. Obiettivo: ${p.goal}. Esempio: ${p.script.replace(/["]/g, "")}`}
                    />
                  </div>
                  <div className="rounded-md bg-muted/60 border-l-2 border-sky-500 p-3 mb-3">
                    <p className="text-xs font-semibold text-sky-700 mb-1 uppercase tracking-wide">
                      Esempio
                    </p>
                    <p className="text-sm leading-relaxed italic">{p.script}</p>
                  </div>
                  <ul className="space-y-1.5">
                    {p.tips.map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{t}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ───────────────── FRASI ───────────────── */}
        <TabsContent value="phrases" className="mt-0">
          <SectionIntro>
            Frasi pronte da usare al volo: aperture di chiamata, ganci di valore, richiesta
            appuntamento e chiusure. Copiale o ascoltale.
          </SectionIntro>
          <div className="flex flex-wrap gap-2 mb-4">
            <FilterChip active={phraseCtx === "all"} onClick={() => setPhraseCtx("all")} count={PHRASES.length}>
              Tutte
            </FilterChip>
            {PHRASE_CONTEXTS.map((c) => (
              <FilterChip
                key={c.value}
                active={phraseCtx === c.value}
                onClick={() => setPhraseCtx(c.value)}
                count={PHRASES.filter((p) => p.context === c.value).length}
              >
                {c.label}
              </FilterChip>
            ))}
          </div>
          {phrases.length === 0 ? (
            <EmptyState onReset={() => { setSearch(""); setPhraseCtx("all") }} search={search} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {phrases.map((p) => (
                <PhraseCard key={p.id} text={p.text} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ───────────────────────── sotto-componenti UI ───────────────────────── */

function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-3xl">{children}</p>
}

const BLOCK_COLORS: Record<string, string> = {
  sky: "border-sky-500 text-sky-700",
  emerald: "border-emerald-500 text-emerald-700",
  amber: "border-amber-500 text-amber-700",
  indigo: "border-indigo-500 text-indigo-700",
}

function InfoBlock({
  color,
  title,
  icon,
  children,
}: {
  color: keyof typeof BLOCK_COLORS
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const cls = BLOCK_COLORS[color] ?? BLOCK_COLORS.sky
  const [borderCls, textCls] = cls.split(" ")
  return (
    <div className={`rounded-md bg-muted/50 border-l-2 ${borderCls} p-3`}>
      <p className={`text-xs font-semibold ${textCls} mb-1 uppercase tracking-wide flex items-center gap-1.5`}>
        {icon}
        {title}
      </p>
      <p className="text-sm leading-relaxed text-foreground/90">{children}</p>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} onClick={onClick} className="gap-2">
      {children}
      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
        {count}
      </Badge>
    </Button>
  )
}

function PhraseCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard non disponibile: ignora silenziosamente
    }
  }
  return (
    <Card className="p-4 border-border flex flex-col gap-3">
      <p className="text-sm leading-relaxed flex-1">&ldquo;{text}&rdquo;</p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCopy} className="gap-2">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          <span className="text-xs">{copied ? "Copiato" : "Copia"}</span>
        </Button>
        <SpeechButton label="la frase" text={text} />
      </div>
    </Card>
  )
}

function EmptyState({ onReset, search }: { onReset: () => void; search: string }) {
  return (
    <Card className="p-12 text-center border-dashed">
      <p className="text-muted-foreground">
        Nessun risultato {search ? `per "${search}"` : "con questi filtri"}.
      </p>
      <Button variant="link" onClick={onReset}>
        Pulisci filtri
      </Button>
    </Card>
  )
}
