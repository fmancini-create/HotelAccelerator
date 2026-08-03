"use client"

import { Check, Menu, MoveUpRight } from "lucide-react"

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

type HeroMode = "cinematic" | "split" | "collage" | "grid" | "immersive" | "catalog"
type BookingMode = "vertical" | "floating" | "inline" | "bottom" | "compact" | "sidebar"
type FooterMode = "story" | "features" | "stats" | "image" | "services" | "map"

type VariantPreset = {
  hero: HeroMode
  booking: BookingMode
  footer: FooterMode
  dark: boolean
  centeredNav?: boolean
  sans?: boolean
  reverse?: boolean
  rounded?: boolean
  label: string
}

const PRESETS: Record<string, VariantPreset> = {
  "luxury-editorial": { hero: "cinematic", booking: "vertical", footer: "story", dark: true, label: "Private world" },
  "luxury-classic": { hero: "split", booking: "floating", footer: "features", dark: false, centeredNav: true, label: "Grand heritage" },
  "boutique-romantic": { hero: "collage", booking: "compact", footer: "story", dark: false, label: "Hosted with care" },
  "boutique-minimal": { hero: "grid", booking: "bottom", footer: "image", dark: false, sans: true, label: "Issue 01" },
  "wellness-organic": { hero: "immersive", booking: "inline", footer: "services", dark: true, centeredNav: true, label: "Breathe · Move · Restore" },
  "wellness-contemporary": { hero: "split", booking: "bottom", footer: "services", dark: true, reverse: true, label: "Advanced wellbeing" },
  "family-sunshine": { hero: "grid", booking: "inline", footer: "features", dark: false, sans: true, rounded: true, label: "Today" },
  "family-elegant": { hero: "cinematic", booking: "bottom", footer: "services", dark: true, centeredNav: true, label: "Family concierge" },
  "business-urban": { hero: "split", booking: "bottom", footer: "stats", dark: true, sans: true, label: "City intelligence" },
  "business-direct": { hero: "split", booking: "inline", footer: "stats", dark: false, sans: true, reverse: true, label: "Best rate guaranteed" },
  "country-authentic": { hero: "split", booking: "bottom", footer: "image", dark: false, reverse: true, label: "From our farm" },
  "country-wine": { hero: "cinematic", booking: "floating", footer: "image", dark: true, centeredNav: true, label: "Estate · Cellar · Table" },
  "bb-elegant": { hero: "collage", booking: "compact", footer: "services", dark: false, reverse: true, label: "Your hosts" },
  "bb-smart": { hero: "split", booking: "floating", footer: "stats", dark: false, sans: true, label: "Self check-in" },
  "mountain-chalet": { hero: "immersive", booking: "bottom", footer: "story", dark: true, label: "Private alpine hideaway" },
  "mountain-resort": { hero: "split", booking: "inline", footer: "features", dark: false, centeredNav: true, label: "Four seasons" },
  "holiday-home-coastal": { hero: "grid", booking: "bottom", footer: "image", dark: false, sans: true, rounded: true, label: "120 m from the beach" },
  "holiday-home-collection": { hero: "catalog", booking: "sidebar", footer: "map", dark: false, sans: true, label: "Find your place" },
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

function Nav({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const tone = preset.dark ? "border-white/25 text-white" : "border-black/10 text-[#202020]"
  return (
    <header className={`relative z-20 flex items-center justify-between border-b px-5 py-4 text-[7px] uppercase tracking-[.2em] sm:px-7 ${tone}`}>
      <div className="font-serif text-[11px] normal-case tracking-normal">{template.preview.eyebrow}</div>
      <nav className={`${preset.centeredNav ? "absolute left-1/2 -translate-x-1/2" : ""} hidden items-center gap-4 md:flex`}>
        {template.preview.nav.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
      </nav>
      <div className="flex items-center gap-3">
        <span className="hidden border-b pb-1 sm:inline">Book now</span>
        <Menu className="h-3.5 w-3.5" />
      </div>
    </header>
  )
}

function Booking({ accent, mode }: { accent: string; mode: BookingMode }) {
  if (mode === "vertical" || mode === "sidebar") {
    return (
      <div className="w-36 bg-white p-3 text-[#191919] shadow-2xl">
        <p className="text-[6px] uppercase tracking-[.2em] text-black/40">Book your stay</p>
        {["Check-in", "Check-out", "Guests"].map((item) => (
          <div key={item} className="border-b py-2">
            <p className="text-[6px] uppercase text-black/40">{item}</p>
            <p className="text-[9px]">Select</p>
          </div>
        ))}
        <div className="mt-3 py-2 text-center text-[7px] font-semibold uppercase tracking-[.15em] text-white" style={{ backgroundColor: accent }}>Check</div>
      </div>
    )
  }

  const compact = mode === "compact"
  return (
    <div className={`grid items-center border border-black/10 bg-white text-[#1f1f1f] shadow-xl ${compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"}`}>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-in</p><p className="mt-1 text-[9px]">12 Oct</p></div>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-out</p><p className="mt-1 text-[9px]">15 Oct</p></div>
      {!compact && <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Guests</p><p className="mt-1 text-[9px]">2 Adults</p></div>}
      <div className="flex h-full min-w-20 items-center justify-center px-3 text-[7px] font-semibold uppercase tracking-[.16em] text-white" style={{ backgroundColor: accent }}>Check</div>
    </div>
  )
}

function Copy({ template, preset, inverse = false, centered = false }: { template: StudioTemplate; preset: VariantPreset; inverse?: boolean; centered?: boolean }) {
  return (
    <div className={centered ? "text-center" : "text-left"}>
      <p className={`text-[7px] uppercase tracking-[.28em] ${inverse ? "text-white/70" : "opacity-50"}`}>{preset.label}</p>
      <h3 className={`${preset.sans ? "font-sans font-bold" : "font-serif"} mt-4 text-4xl leading-[.92] tracking-[-.045em] sm:text-5xl`}>{template.preview.headline}</h3>
      <p className={`mt-4 text-[9px] leading-relaxed sm:text-[10px] ${inverse ? "text-white/75" : "opacity-60"}`}>{template.preview.subheadline}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-[7px] uppercase tracking-[.2em]">Discover <MoveUpRight className="h-3 w-3" /></span>
    </div>
  )
}

function CinematicHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  return (
    <div className="relative h-[430px] overflow-hidden text-white">
      <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" />
      <Nav template={template} preset={preset} />
      <div className={`relative z-10 grid h-[370px] px-7 py-9 ${preset.booking === "vertical" ? "grid-cols-[1.35fr_.65fr]" : "grid-cols-1"}`}>
        <div className="max-w-xl"><Copy template={template} preset={preset} inverse /></div>
        {preset.booking === "vertical" && <div className="flex items-end justify-end"><Booking accent={p.accent} mode="vertical" /></div>}
      </div>
    </div>
  )
}

function SplitHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  const copy = <div className={`flex flex-col justify-center px-8 ${preset.dark ? "bg-[#202726] text-white" : "bg-[#f5f1e9] text-[#242424]"}`}><Copy template={template} preset={preset} inverse={preset.dark} />{preset.booking === "inline" && <div className="mt-6"><Booking accent={p.accent} mode="inline" /></div>}</div>
  const image = <div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" />{preset.booking === "floating" && <div className="absolute bottom-4 left-4 right-4"><Booking accent={p.accent} mode="compact" /></div>}</div>

  return (
    <div className={preset.dark ? "bg-[#202726] text-white" : "bg-[#f5f1e9] text-[#242424]"}>
      <Nav template={template} preset={preset} />
      <div className="grid h-[365px] grid-cols-[.9fr_1.1fr]">
        {preset.reverse ? image : copy}
        {preset.reverse ? copy : image}
      </div>
    </div>
  )
}

function CollageHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  return (
    <div className="bg-[#fbf3eb] text-[#33251f]">
      <Nav template={template} preset={preset} />
      <div className={`grid h-[385px] grid-cols-[.95fr_1.05fr] gap-8 p-8 ${preset.reverse ? "direction-rtl" : ""}`}>
        <div className="relative">
          <div className="absolute left-4 top-2 h-[270px] w-[78%] -rotate-3 bg-white p-2 shadow-xl"><img src={p.image} alt="" className="h-full w-full object-cover" /></div>
          <div className="absolute bottom-3 right-0 h-[150px] w-[55%] rotate-3 bg-white p-2 shadow-xl"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div>
        </div>
        <div className="flex items-center"><Copy template={template} preset={preset} /></div>
      </div>
    </div>
  )
}

function GridHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  const radius = preset.rounded ? "rounded-[2rem]" : ""
  return (
    <div className="bg-[#f4f2ed] text-[#202020]">
      <Nav template={template} preset={preset} />
      <div className="grid h-[385px] grid-cols-12 gap-3 p-4">
        <div className={`col-span-4 flex flex-col justify-center bg-white p-6 ${radius}`}><Copy template={template} preset={preset} /></div>
        <div className={`col-span-5 overflow-hidden ${radius}`}><img src={p.image} alt="" className="h-full w-full object-cover" /></div>
        <div className="col-span-3 grid grid-rows-2 gap-3">
          <div className={`p-5 text-white ${radius}`} style={{ backgroundColor: p.accent }}><p className="text-[7px] uppercase tracking-widest">{preset.label}</p><p className="mt-4 text-2xl font-semibold">Explore more.</p></div>
          <div className={`overflow-hidden ${radius}`}><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div>
        </div>
      </div>
    </div>
  )
}

function ImmersiveHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  return (
    <div className="relative h-[500px] overflow-hidden text-white">
      <img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />
      <Nav template={template} preset={preset} />
      <div className="relative z-10 flex h-[430px] items-center justify-center px-8">
        <div className="max-w-xl"><Copy template={template} preset={preset} inverse centered /></div>
      </div>
    </div>
  )
}

function CatalogHero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview
  return (
    <div className="bg-[#f7f4ef] text-[#222]">
      <Nav template={template} preset={preset} />
      <div className="grid h-[390px] grid-cols-[.72fr_1.28fr]">
        <aside className="border-r p-6">
          <Copy template={template} preset={preset} />
          <div className="mt-5 space-y-2 text-[8px]"><div className="border p-3">Destination</div><div className="border p-3">Property type</div><div className="p-3 text-center text-white" style={{ backgroundColor: p.accent }}>Search homes</div></div>
        </aside>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="relative row-span-2 overflow-hidden"><img src={p.image} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white p-2 text-[7px] uppercase">Country villa</span></div>
          <div className="relative overflow-hidden"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white p-2 text-[7px] uppercase">City apartment</span></div>
          <div className="flex items-center justify-center border text-center"><div><p className="text-3xl font-bold">24</p><p className="text-[7px] uppercase">Homes available</p></div></div>
        </div>
      </div>
    </div>
  )
}

function Hero({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  if (preset.hero === "cinematic") return <CinematicHero template={template} preset={preset} />
  if (preset.hero === "split") return <SplitHero template={template} preset={preset} />
  if (preset.hero === "collage") return <CollageHero template={template} preset={preset} />
  if (preset.hero === "grid") return <GridHero template={template} preset={preset} />
  if (preset.hero === "catalog") return <CatalogHero template={template} preset={preset} />
  return <ImmersiveHero template={template} preset={preset} />
}

function Footer({ template, preset }: { template: StudioTemplate; preset: VariantPreset }) {
  const p = template.preview

  if (preset.footer === "stats") {
    return <div className="grid h-[110px] grid-cols-3 divide-x bg-[#18202d] p-5 text-center text-white"><div><p className="text-xl font-bold">-10%</p><p className="text-[7px] uppercase opacity-55">Direct rate</p></div><div><p className="text-xl font-bold">24/7</p><p className="text-[7px] uppercase opacity-55">Access</p></div><div><p className="text-xl font-bold">3 min</p><p className="text-[7px] uppercase opacity-55">From centre</p></div></div>
  }

  if (preset.footer === "features") {
    return <div className="grid h-[110px] grid-cols-3 bg-white p-6 text-center"><span>Rooms</span><span className="border-x">Experiences</span><span>Services</span></div>
  }

  if (preset.footer === "map") {
    return <div className="grid h-[105px] grid-cols-3 divide-x bg-white text-center"><span className="p-6">Map search</span><span className="p-6">Instant booking</span><span className="p-6">Local support</span></div>
  }

  if (preset.footer === "story") {
    return <div className="grid h-[120px] grid-cols-[1fr_auto] items-center bg-[#f2ede4] px-7"><p className="font-serif text-xl">A different way to experience the destination.</p><div className="w-72"><Booking accent={p.accent} mode="compact" /></div></div>
  }

  if (preset.footer === "services") {
    return <div className="grid h-[120px] grid-cols-[.7fr_1.3fr] bg-white"><div className="flex flex-col justify-center px-7"><p className="font-serif text-xl">Tailored services</p><p className="text-[8px] opacity-50">Designed around every guest.</p></div><div className="flex items-center px-7"><Booking accent={p.accent} mode="inline" /></div></div>
  }

  return <div className="grid h-[120px] grid-cols-[.7fr_1.3fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} mode="inline" /></div></div>
}

function RealisticHomepage({ template }: PreviewProps) {
  const preset = PRESETS[template.id] ?? PRESETS["luxury-editorial"]
  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-[0_24px_70px_-38px_rgba(0,0,0,.65)]">
      <BrowserChrome />
      <Hero template={template} preset={preset} />
      {(preset.booking === "bottom" || preset.footer !== "story") && <Footer template={template} preset={preset} />}
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
