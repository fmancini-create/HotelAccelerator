"use client"

import { Check, MapPin, Menu, MoveUpRight } from "lucide-react"

export type StudioTemplate = {
  id: string
  baseTemplateId: string
  name: string
  category: string
  collection: string
  layout: "editorial" | "classic" | "minimal" | "immersive" | "conversion" | "collection"
  description: string
  idealFor: string[]
  features: string[]
  preview: {
    eyebrow: string
    headline: string
    subheadline: string
    accent: string
    background: string
    foreground: string
    image: string
    secondaryImage: string
    nav: string[]
  }
}

function BrowserChrome() {
  return (
    <div className="flex h-7 items-center gap-1.5 border-b border-black/10 bg-[#eceae6] px-3">
      <span className="h-2 w-2 rounded-full bg-[#f26b5e]" />
      <span className="h-2 w-2 rounded-full bg-[#e8b64b]" />
      <span className="h-2 w-2 rounded-full bg-[#62b46f]" />
      <div className="mx-auto h-3.5 w-2/5 rounded bg-white/70" />
    </div>
  )
}

function BookingBar({ accent, compact = false }: { accent: string; compact?: boolean }) {
  return (
    <div className={`grid items-center border border-black/10 bg-white text-[#1f1f1f] shadow-xl ${compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"}`}>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-in</p><p className="mt-1 text-[9px]">12 Oct</p></div>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-out</p><p className="mt-1 text-[9px]">15 Oct</p></div>
      {!compact && <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Guests</p><p className="mt-1 text-[9px]">2 Adults</p></div>}
      <div className="flex h-full min-w-20 items-center justify-center px-3 text-[7px] font-semibold uppercase tracking-[.16em] text-white" style={{ backgroundColor: accent }}>Check</div>
    </div>
  )
}

function RealisticHomepage({ template }: { template: StudioTemplate }) {
  const { preview, layout } = template
  const darkHero = ["editorial", "immersive"].includes(layout) || template.category === "business"

  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-[0_24px_70px_-38px_rgba(0,0,0,.65)]">
      <BrowserChrome />
      <div className="relative h-[360px] overflow-hidden bg-neutral-900 text-white sm:h-[410px]">
        <img src={preview.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        <div className={`absolute inset-0 ${darkHero ? "bg-gradient-to-r from-black/70 via-black/25 to-black/10" : "bg-gradient-to-t from-black/55 via-black/5 to-black/20"}`} />

        <header className="relative z-10 flex items-center justify-between border-b border-white/25 px-5 py-4 text-[7px] uppercase tracking-[.2em] sm:px-7">
          <div className="font-serif text-[11px] normal-case tracking-normal">{preview.eyebrow}</div>
          <nav className="hidden items-center gap-4 md:flex">{preview.nav.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</nav>
          <div className="flex items-center gap-3"><span className="hidden border-b border-white pb-1 sm:inline">Book now</span><Menu className="h-3.5 w-3.5" /></div>
        </header>

        <div className={`relative z-10 flex h-[calc(100%-49px)] flex-col px-5 pb-5 pt-10 sm:px-7 ${layout === "minimal" ? "items-center text-center" : layout === "classic" ? "items-center justify-center text-center" : "justify-between"}`}>
          <div className={`${layout === "classic" ? "max-w-[76%]" : layout === "minimal" ? "max-w-[72%]" : "max-w-[68%]"}`}>
            <p className="mb-3 text-[7px] uppercase tracking-[.28em] text-white/80">{template.collection}</p>
            <h3 className="font-serif text-[clamp(2rem,4vw,3.8rem)] font-normal leading-[.92] tracking-[-.045em]">{preview.headline}</h3>
            <p className="mt-4 max-w-md text-[9px] leading-relaxed text-white/80 sm:text-[10px]">{preview.subheadline}</p>
            <div className={`mt-5 inline-flex items-center gap-2 text-[7px] uppercase tracking-[.2em] ${layout === "classic" ? "border border-white/60 px-4 py-2" : ""}`}>
              Discover <MoveUpRight className="h-3 w-3" />
            </div>
          </div>

          <div className={`w-full ${layout === "conversion" ? "max-w-xl" : "max-w-[88%] self-center"}`}>
            <BookingBar accent={preview.accent} compact={layout === "minimal"} />
          </div>
        </div>
      </div>

      <div className="grid h-[150px] grid-cols-[1.05fr_.95fr] bg-[#f6f3ed] text-[#222]">
        <div className="flex flex-col justify-center p-5 sm:p-7">
          <p className="text-[6px] uppercase tracking-[.24em] text-black/45">The experience</p>
          <p className="mt-2 font-serif text-lg leading-tight sm:text-xl">A stay shaped around place, people and time.</p>
          <div className="mt-3 flex items-center gap-1 text-[7px] uppercase tracking-[.15em]"><MapPin className="h-3 w-3" /> Explore the destination</div>
        </div>
        <div className="relative overflow-hidden"><img src={preview.secondaryImage} alt="" className="h-full w-full object-cover" loading="lazy" /><div className="absolute inset-0 bg-black/10" /></div>
      </div>
    </div>
  )
}

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return (
    <article className={`group overflow-hidden rounded-xl border bg-background transition duration-300 ${selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-foreground/40"}`}>
      <RealisticHomepage template={template} />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">{template.collection}</span>
            {selected && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary-foreground"><Check className="h-3 w-3" /> Selezionato</span>}
          </div>
          <h2 className="font-serif text-2xl font-normal tracking-[-.025em]">{template.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
        </div>
        <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Ideale per</p>
          <p className="mt-2 text-sm leading-6">{template.idealFor.join(" · ")}</p>
          <p className="mt-3 text-[10px] uppercase tracking-[.15em] text-muted-foreground">{template.features.slice(0, 3).join(" / ")}</p>
        </div>
      </div>
    </article>
  )
}
