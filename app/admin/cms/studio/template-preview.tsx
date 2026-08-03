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
  return <div className="flex h-7 items-center gap-1.5 border-b border-black/10 bg-[#eceae6] px-3"><span className="h-2 w-2 rounded-full bg-[#f26b5e]" /><span className="h-2 w-2 rounded-full bg-[#e8b64b]" /><span className="h-2 w-2 rounded-full bg-[#62b46f]" /><div className="mx-auto h-3.5 w-2/5 rounded bg-white/70" /></div>
}

function BookingBar({ accent, vertical = false, compact = false }: { accent: string; vertical?: boolean; compact?: boolean }) {
  if (vertical) return <div className="w-36 bg-white p-3 text-[#191919] shadow-2xl"><p className="text-[6px] uppercase tracking-[.2em] text-black/40">Book your stay</p>{["Check-in", "Check-out", "Guests"].map((item) => <div key={item} className="border-b py-2"><p className="text-[6px] uppercase text-black/40">{item}</p><p className="text-[9px]">Select</p></div>)}<div className="mt-3 py-2 text-center text-[7px] font-semibold uppercase tracking-[.15em] text-white" style={{ backgroundColor: accent }}>Check</div></div>
  return <div className={`grid items-center border border-black/10 bg-white text-[#1f1f1f] shadow-xl ${compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"}`}><div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-in</p><p className="mt-1 text-[9px]">12 Oct</p></div><div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-out</p><p className="mt-1 text-[9px]">15 Oct</p></div>{!compact && <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Guests</p><p className="mt-1 text-[9px]">2 Adults</p></div>}<div className="flex h-full min-w-20 items-center justify-center px-3 text-[7px] font-semibold uppercase tracking-[.16em] text-white" style={{ backgroundColor: accent }}>Check</div></div>
}

function Header({ template, dark = true, centered = false }: { template: StudioTemplate; dark?: boolean; centered?: boolean }) {
  const color = dark ? "text-white border-white/25" : "text-[#202020] border-black/10"
  return <header className={`relative z-10 flex items-center justify-between border-b px-5 py-4 text-[7px] uppercase tracking-[.2em] sm:px-7 ${color}`}><div className="font-serif text-[11px] normal-case tracking-normal">{template.preview.eyebrow}</div><nav className={`${centered ? "absolute left-1/2 -translate-x-1/2" : ""} hidden items-center gap-4 md:flex`}>{template.preview.nav.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</nav><div className="flex items-center gap-3"><span className="hidden border-b pb-1 sm:inline">Book now</span><Menu className="h-3.5 w-3.5" /></div></header>
}

function Editorial({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="relative h-[410px] overflow-hidden bg-neutral-900 text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/30 to-transparent" /><Header template={template} /><div className="relative z-10 grid h-[350px] grid-cols-[1.3fr_.7fr] px-7 py-10"><div className="flex flex-col justify-between"><div className="max-w-[78%]"><p className="mb-3 text-[7px] uppercase tracking-[.28em] text-white/75">{template.collection}</p><h3 className="font-serif text-5xl leading-[.9] tracking-[-.045em]">{p.headline}</h3><p className="mt-4 max-w-sm text-[10px] leading-relaxed text-white/80">{p.subheadline}</p></div><span className="inline-flex items-center gap-2 text-[7px] uppercase tracking-[.2em]">Discover <MoveUpRight className="h-3 w-3" /></span></div><div className="flex items-end justify-end"><BookingBar accent={p.accent} vertical /></div></div></div><div className="grid h-[150px] grid-cols-[1.2fr_.8fr] bg-[#f3eee5]"><div className="p-7"><p className="text-[6px] uppercase tracking-[.25em] text-black/40">Journal</p><p className="mt-3 max-w-xs font-serif text-2xl leading-tight">Stories, rituals and places worth slowing down for.</p></div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></>
}

function Classic({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="bg-[#f6f0e7] text-[#2d261f]"><Header template={template} dark={false} centered /><div className="grid h-[360px] grid-cols-[.78fr_1.22fr]"><div className="flex flex-col items-center justify-center px-8 text-center"><p className="text-[7px] uppercase tracking-[.3em]" style={{ color: p.accent }}>{template.collection}</p><div className="my-5 h-px w-12" style={{ backgroundColor: p.accent }} /><h3 className="font-serif text-4xl leading-[.96]">{p.headline}</h3><p className="mt-4 text-[9px] leading-relaxed text-black/60">{p.subheadline}</p><button className="mt-6 border px-5 py-2 text-[7px] uppercase tracking-[.2em]">Explore</button></div><img src={p.image} alt="" className="h-full w-full object-cover" /></div></div><div className="relative -mt-5 px-8"><BookingBar accent={p.accent} /></div><div className="grid h-[125px] grid-cols-3 bg-white p-6 text-center"><div><p className="font-serif text-xl">Suites</p><p className="text-[7px] uppercase tracking-widest text-black/40">Private spaces</p></div><div className="border-x"><p className="font-serif text-xl">Dining</p><p className="text-[7px] uppercase tracking-widest text-black/40">Fine cuisine</p></div><div><p className="font-serif text-xl">Concierge</p><p className="text-[7px] uppercase tracking-widest text-black/40">Tailored service</p></div></div></>
}

function Minimal({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="bg-[#f5f3ee] text-[#171717]"><Header template={template} dark={false} /><div className="grid h-[390px] grid-cols-12 gap-3 p-5"><div className="col-span-5 flex flex-col justify-between bg-white p-6"><p className="text-[7px] uppercase tracking-[.3em]" style={{ color: p.accent }}>{p.eyebrow}</p><div><h3 className="font-sans text-4xl font-semibold leading-[.9] tracking-[-.06em]">{p.headline}</h3><p className="mt-4 text-[9px] leading-relaxed text-black/55">{p.subheadline}</p></div><span className="text-[7px] uppercase tracking-[.2em]">View rooms →</span></div><img src={p.image} alt="" className="col-span-7 h-full w-full object-cover" /></div></div><div className="grid h-[145px] grid-cols-[.8fr_1.2fr] bg-[#151515] text-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover grayscale" /><div className="flex items-center justify-between p-6"><div><p className="text-[7px] uppercase tracking-[.25em] text-white/45">Direct booking</p><p className="mt-2 text-xl font-medium">Simple dates. Clear rates.</p></div><div className="w-52"><BookingBar accent={p.accent} compact /></div></div></div></>
}

function Immersive({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="relative h-[500px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/30" /><Header template={template} /><div className="relative z-10 flex h-[430px] flex-col items-center justify-center px-8 text-center"><p className="text-[7px] uppercase tracking-[.35em]">{p.eyebrow}</p><h3 className="mt-5 max-w-xl font-serif text-6xl leading-[.86] tracking-[-.05em]">{p.headline}</h3><p className="mt-5 max-w-sm text-[10px] leading-relaxed text-white/85">{p.subheadline}</p><div className="mt-8 h-12 w-px bg-white/60" /></div></div><div className="grid h-[115px] grid-cols-[1fr_auto] items-center gap-5 px-7" style={{ backgroundColor: p.background, color: p.foreground }}><div><p className="text-[7px] uppercase tracking-[.25em] opacity-50">Choose your retreat</p><p className="mt-2 font-serif text-xl">Stay · Restore · Reconnect</p></div><div className="w-72"><BookingBar accent={p.accent} /></div></div></>
}

function Conversion({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="bg-white text-[#10242b]"><div className="flex items-center justify-between bg-[#10242b] px-6 py-2 text-[7px] uppercase tracking-[.18em] text-white"><span>Best rate guaranteed</span><span>Free cancellation · Direct benefits</span></div><Header template={template} dark={false} /><div className="grid h-[350px] grid-cols-[1.05fr_.95fr]"><div className="flex flex-col justify-center px-8"><span className="w-fit rounded-full px-3 py-1 text-[7px] font-semibold uppercase text-white" style={{ backgroundColor: p.accent }}>Book direct</span><h3 className="mt-5 font-sans text-5xl font-bold leading-[.9] tracking-[-.055em]">{p.headline}</h3><p className="mt-4 max-w-md text-[10px] text-black/55">{p.subheadline}</p><div className="mt-6"><BookingBar accent={p.accent} /></div></div><img src={p.image} alt="" className="h-full w-full object-cover" /></div></div><div className="grid h-[120px] grid-cols-3 divide-x bg-[#eef5f5] p-5 text-center"><div><p className="text-xl font-bold">-10%</p><p className="text-[7px] uppercase tracking-wider">Direct rate</p></div><div><p className="text-xl font-bold">Free</p><p className="text-[7px] uppercase tracking-wider">Late check-out</p></div><div><p className="text-xl font-bold">24/7</p><p className="text-[7px] uppercase tracking-wider">Support</p></div></div></>
}

function Collection({ template }: { template: StudioTemplate }) {
  const p = template.preview
  return <><div className="bg-[#fff7e8] text-[#24354a]"><Header template={template} dark={false} /><div className="grid h-[365px] grid-cols-[1fr_.75fr] gap-3 p-4"><div className="relative overflow-hidden rounded-3xl"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" /><div className="absolute bottom-6 left-6 max-w-sm text-white"><p className="text-[7px] uppercase tracking-[.25em]">{p.eyebrow}</p><h3 className="mt-3 font-sans text-4xl font-bold leading-[.92]">{p.headline}</h3></div></div><div className="grid grid-rows-2 gap-3"><div className="rounded-3xl p-5" style={{ backgroundColor: p.accent }}><p className="text-[7px] uppercase tracking-widest text-white/70">Today</p><p className="mt-3 text-2xl font-bold text-white">Pool, games and little adventures</p></div><div className="relative overflow-hidden rounded-3xl"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-4 left-4 rounded-full bg-white px-3 py-2 text-[7px] font-bold uppercase">Explore activities</span></div></div></div></div><div className="grid h-[125px] grid-cols-[1fr_auto] items-center gap-5 bg-white px-7"><div><p className="text-[7px] uppercase tracking-[.2em] text-black/40">Plan your stay</p><p className="mt-2 text-xl font-bold">Everything your guests need, at a glance.</p></div><div className="w-72"><BookingBar accent={p.accent} /></div></div></>
}

function RealisticHomepage({ template }: { template: StudioTemplate }) {
  const layouts = { editorial: Editorial, classic: Classic, minimal: Minimal, immersive: Immersive, conversion: Conversion, collection: Collection }
  const Layout = layouts[template.layout]
  return <div className="overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-[0_24px_70px_-38px_rgba(0,0,0,.65)]"><BrowserChrome /><Layout template={template} /></div>
}

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return <article className={`group overflow-hidden rounded-xl border bg-background transition duration-300 ${selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-foreground/40"}`}><RealisticHomepage template={template} /><div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">{template.collection}</span>{selected && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary-foreground"><Check className="h-3 w-3" /> Selezionato</span>}</div><h2 className="font-serif text-2xl font-normal tracking-[-.025em]">{template.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p></div><div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Ideale per</p><p className="mt-2 text-sm leading-6">{template.idealFor.join(" · ")}</p><p className="mt-3 text-[10px] uppercase tracking-[.15em] text-muted-foreground">{template.features.slice(0, 3).join(" / ")}</p></div></div></article>
}
