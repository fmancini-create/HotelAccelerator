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

type PreviewProps = { template: StudioTemplate }

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

function Nav({ template, dark = true, centered = false }: PreviewProps & { dark?: boolean; centered?: boolean }) {
  return (
    <header className={`relative z-10 flex items-center justify-between border-b px-5 py-4 text-[7px] uppercase tracking-[.2em] sm:px-7 ${dark ? "border-white/25 text-white" : "border-black/10 text-[#202020]"}`}>
      <div className="font-serif text-[11px] normal-case tracking-normal">{template.preview.eyebrow}</div>
      <nav className={`${centered ? "absolute left-1/2 -translate-x-1/2" : ""} hidden items-center gap-4 md:flex`}>
        {template.preview.nav.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
      </nav>
      <div className="flex items-center gap-3"><span className="hidden border-b pb-1 sm:inline">Book now</span><Menu className="h-3.5 w-3.5" /></div>
    </header>
  )
}

function Booking({ accent, compact = false, vertical = false }: { accent: string; compact?: boolean; vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="w-36 bg-white p-3 text-[#191919] shadow-2xl">
        <p className="text-[6px] uppercase tracking-[.2em] text-black/40">Book your stay</p>
        {["Check-in", "Check-out", "Guests"].map((item) => <div key={item} className="border-b py-2"><p className="text-[6px] uppercase text-black/40">{item}</p><p className="text-[9px]">Select</p></div>)}
        <div className="mt-3 py-2 text-center text-[7px] font-semibold uppercase tracking-[.15em] text-white" style={{ backgroundColor: accent }}>Check</div>
      </div>
    )
  }
  return (
    <div className={`grid items-center border border-black/10 bg-white text-[#1f1f1f] shadow-xl ${compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"}`}>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-in</p><p className="mt-1 text-[9px]">12 Oct</p></div>
      <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-out</p><p className="mt-1 text-[9px]">15 Oct</p></div>
      {!compact && <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Guests</p><p className="mt-1 text-[9px]">2 Adults</p></div>}
      <div className="flex h-full min-w-20 items-center justify-center px-3 text-[7px] font-semibold uppercase tracking-[.16em] text-white" style={{ backgroundColor: accent }}>Check</div>
    </div>
  )
}

function Copy({ template, inverse = false, sans = false, center = false }: PreviewProps & { inverse?: boolean; sans?: boolean; center?: boolean }) {
  return (
    <div className={center ? "text-center" : "text-left"}>
      <p className={`text-[7px] uppercase tracking-[.28em] ${inverse ? "text-white/70" : "opacity-50"}`}>{template.collection}</p>
      <h3 className={`${sans ? "font-sans font-bold" : "font-serif"} mt-4 text-4xl leading-[.92] tracking-[-.045em] sm:text-5xl`}>{template.preview.headline}</h3>
      <p className={`mt-4 text-[9px] leading-relaxed sm:text-[10px] ${inverse ? "text-white/75" : "opacity-60"}`}>{template.preview.subheadline}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-[7px] uppercase tracking-[.2em]">Discover <MoveUpRight className="h-3 w-3" /></span>
    </div>
  )
}

function Canvas({ template }: PreviewProps) {
  const p = template.preview

  switch (template.id) {
    case "luxury-editorial":
      return <><div className="relative h-[440px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" /><Nav template={template} /><div className="relative z-10 grid h-[380px] grid-cols-[1.35fr_.65fr] px-7 py-10"><Copy template={template} inverse /><div className="flex items-end justify-end"><Booking accent={p.accent} vertical /></div></div></div><div className="grid h-[145px] grid-cols-[1.2fr_.8fr] bg-[#f2ede4]"><div className="p-7 font-serif text-2xl">Stories, rituals and places worth slowing down for.</div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></>

    case "luxury-classic":
      return <><div className="bg-[#f6f0e7] text-[#2d261f]"><Nav template={template} dark={false} centered /><div className="grid h-[365px] grid-cols-[.8fr_1.2fr]"><div className="flex items-center px-8"><Copy template={template} center /></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-5 border border-white/60" /></div></div></div></div><div className="relative -mt-5 px-8"><Booking accent={p.accent} /></div><div className="grid h-[115px] grid-cols-3 bg-white p-6 text-center"><span>Suites</span><span className="border-x">Dining</span><span>Concierge</span></div></>

    case "boutique-romantic":
      return <><div className="bg-[#f8efe7] text-[#33251f]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-[.92fr_1.08fr] gap-8 p-8"><div className="relative"><div className="absolute left-4 top-2 h-[275px] w-[78%] -rotate-3 bg-white p-2 shadow-xl"><img src={p.image} alt="" className="h-full w-full object-cover" /></div><div className="absolute bottom-3 right-0 h-[155px] w-[55%] rotate-3 bg-white p-2 shadow-xl"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></div><div className="flex items-center"><Copy template={template} /></div></div></div><div className="grid h-[105px] grid-cols-[1fr_auto] items-center bg-white px-8"><p className="font-serif text-xl">Three rooms. One personal story.</p><div className="w-64"><Booking accent={p.accent} compact /></div></div></>

    case "boutique-minimal":
      return <><div className="bg-[#f3f1ec] text-[#171717]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-12 gap-3 p-5"><div className="col-span-4 flex flex-col justify-center bg-white p-6"><Copy template={template} sans /></div><img src={p.image} alt="" className="col-span-5 h-full w-full object-cover" /><div className="col-span-3 grid grid-rows-2 gap-3"><div className="p-5 text-white" style={{ backgroundColor: p.accent }}><p className="text-2xl font-semibold">Rooms with character.</p></div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover grayscale" /></div></div></div><div className="bg-[#151515] p-5"><Booking accent={p.accent} compact /></div></>

    case "wellness-organic":
      return <><div className="relative h-[500px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/30" /><Nav template={template} /><div className="relative z-10 flex h-[430px] items-center justify-center px-8"><div className="max-w-xl"><Copy template={template} inverse center /></div></div></div><div className="grid h-[115px] grid-cols-[1fr_auto] items-center px-7" style={{ backgroundColor: p.background, color: p.foreground }}><p className="font-serif text-xl">Retreats · Rituals · Nourishment</p><div className="w-72"><Booking accent={p.accent} /></div></div></>

    case "wellness-contemporary":
      return <><div className="bg-[#202726] text-white"><Nav template={template} /><div className="grid h-[365px] grid-cols-[1.08fr_.92fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-5 left-5 rounded-full bg-white px-4 py-2 text-[7px] uppercase text-black">Book a treatment</span></div><div className="flex flex-col justify-center px-8"><Copy template={template} inverse /><div className="mt-6 grid grid-cols-2 gap-2 text-[7px] uppercase"><span className="border p-3">Treatments</span><span className="border p-3">Programmes</span><span className="border p-3">Day spa</span><span className="border p-3">Diagnostics</span></div></div></div></div><div className="grid h-[120px] grid-cols-[.75fr_1.25fr] bg-[#f3eee7]"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "family-sunshine":
      return <><div className="bg-[#fff6e4] text-[#24354a]"><Nav template={template} dark={false} /><div className="grid h-[365px] grid-cols-[1fr_.72fr] gap-3 p-4"><div className="relative overflow-hidden rounded-[2rem]"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" /><div className="absolute bottom-6 left-6 max-w-sm text-white"><h3 className="text-4xl font-bold">{p.headline}</h3></div></div><div className="grid grid-rows-2 gap-3"><div className="rounded-[2rem] p-5 text-white" style={{ backgroundColor: p.accent }}><p className="text-2xl font-bold">Pool, games and little adventures</p></div><img src={p.secondaryImage} alt="" className="h-full w-full rounded-[2rem] object-cover" /></div></div></div><div className="grid h-[120px] grid-cols-[1fr_auto] items-center bg-white px-7"><p className="text-xl font-bold">Everything families need.</p><div className="w-72"><Booking accent={p.accent} /></div></div></>

    case "family-elegant":
      return <><div className="bg-[#f0eae1] text-[#26322f]"><Nav template={template} dark={false} centered /><div className="relative h-[370px]"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-[#26322f]/90 via-[#26322f]/45 to-transparent" /><div className="relative z-10 flex h-full w-[52%] items-center px-8 text-white"><Copy template={template} inverse /></div></div></div><div className="grid h-[145px] grid-cols-[.7fr_1.3fr] bg-white"><div className="flex flex-col justify-center px-7"><p className="font-serif text-xl">Family concierge</p><p className="text-[8px] opacity-50">Tailored services for every generation.</p></div><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "business-urban":
      return <><div className="bg-[#18202d] text-white"><Nav template={template} /><div className="grid h-[390px] grid-cols-[.7fr_1.3fr]"><div className="flex flex-col justify-between border-r border-white/10 p-7"><Copy template={template} inverse sans /><div className="grid grid-cols-2 gap-2 text-[7px] uppercase text-white/60"><span>24h desk</span><span>Fast Wi-Fi</span><span>Meeting</span><span>City centre</span></div></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-5 right-5 bg-white p-4 text-black"><p className="text-xl font-semibold">8 minutes away</p></div></div></div></div><div className="grid h-[115px] grid-cols-[.55fr_1.45fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover grayscale" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "business-direct":
      return <><div className="bg-white text-[#10242b]"><div className="flex justify-between bg-[#10242b] px-6 py-2 text-[7px] uppercase text-white"><span>Best rate guaranteed</span><span>Direct benefits</span></div><Nav template={template} dark={false} /><div className="grid h-[350px] grid-cols-[1.05fr_.95fr]"><div className="flex flex-col justify-center px-8"><Copy template={template} sans /><div className="mt-6"><Booking accent={p.accent} /></div></div><img src={p.image} alt="" className="h-full w-full object-cover" /></div></div><div className="grid h-[120px] grid-cols-3 divide-x bg-[#eef5f5] p-5 text-center"><span>-10% direct</span><span>Free late check-out</span><span>24/7 support</span></div></>

    case "country-authentic":
      return <><div className="bg-[#f4efe5] text-[#2d3427]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-[1.15fr_.85fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-0 right-0 w-44 bg-[#f4efe5] p-5 font-serif text-xl">Seasonal table, local hands.</div></div><div className="flex items-center px-8"><Copy template={template} /></div></div></div><div className="grid h-[125px] grid-cols-[.65fr_1.35fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "country-wine":
      return <><div className="bg-[#3a2924] text-[#f5eddf]"><Nav template={template} centered /><div className="grid h-[380px] grid-cols-[.62fr_1.38fr]"><div className="flex items-center px-7"><Copy template={template} inverse /></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-6 border border-white/45" /></div></div></div></div><div className="grid h-[135px] grid-cols-[.9fr_1.1fr] bg-[#f5eddf] text-[#3a2924]"><div className="grid grid-cols-2"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center p-5 font-serif text-xl">Taste the estate.</div></div><div className="flex items-center px-6"><Booking accent={p.accent} /></div></div></>

    case "bb-elegant":
      return <><div className="bg-[#fbf4ec] text-[#33251f]"><Nav template={template} dark={false} /><div className="grid h-[375px] grid-cols-[.95fr_1.05fr] gap-7 p-7"><div className="flex items-center"><div><Copy template={template} /><div className="mt-6 flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-black/10" /><p className="font-serif text-sm">Anna & Marco · Your hosts</p></div></div></div><div className="relative"><img src={p.image} alt="" className="h-[82%] w-full object-cover" /><img src={p.secondaryImage} alt="" className="absolute bottom-0 -left-10 h-[42%] w-[50%] border-8 border-[#fbf4ec] object-cover" /></div></div></div><div className="grid h-[115px] grid-cols-[1fr_auto] items-center bg-white px-7"><p className="font-serif text-xl">Breakfast included. Advice personal.</p><div className="w-64"><Booking accent={p.accent} compact /></div></div></>

    case "bb-smart":
      return <><div className="bg-[#f4f3ef] text-[#20252a]"><Nav template={template} dark={false} /><div className="grid h-[365px] grid-cols-[.92fr_1.08fr]"><div className="flex flex-col justify-center px-7"><span className="w-fit rounded-full px-3 py-1 text-[7px] font-bold uppercase text-white" style={{ backgroundColor: p.accent }}>Self check-in</span><Copy template={template} sans /><div className="mt-5 grid grid-cols-2 gap-2 text-[7px] uppercase"><span className="border p-3">Central</span><span className="border p-3">Smart access</span><span className="border p-3">Fast Wi-Fi</span><span className="border p-3">Local map</span></div></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-4 left-4 right-4"><Booking accent={p.accent} compact /></div></div></div></div><div className="grid h-[105px] grid-cols-3 bg-[#20252a] p-5 text-center text-white"><span>3 min station</span><span>24/7 access</span><span>100% direct</span></div></>

    case "mountain-chalet":
      return <><div className="relative h-[500px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-black/10" /><Nav template={template} /><div className="relative z-10 flex h-[430px] items-end px-8 pb-10"><div className="max-w-xl"><Copy template={template} inverse /></div></div></div><div className="grid h-[120px] grid-cols-[.8fr_1.2fr] bg-[#202523] text-white"><div className="flex items-center px-7 font-serif text-xl">Fireplace evenings. Wild mornings.</div><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "mountain-resort":
      return <><div className="bg-[#edf1ef] text-[#1c2b28]"><Nav template={template} dark={false} centered /><div className="grid h-[370px] grid-cols-[1.2fr_.8fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute left-5 top-5 grid gap-2 text-[7px] uppercase"><span className="bg-white p-2">Winter</span><span className="bg-white p-2">Summer</span><span className="bg-white p-2">Spa</span></div></div><div className="flex flex-col justify-center px-7"><Copy template={template} /><div className="mt-6"><Booking accent={p.accent} compact /></div></div></div></div><div className="grid h-[125px] grid-cols-4 bg-white text-center"><span>Ski</span><span>Spa</span><span>Hike</span><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></>

    case "holiday-home-coastal":
      return <><div className="bg-[#edf8fa] text-[#153a43]"><Nav template={template} dark={false} /><div className="grid h-[370px] grid-cols-[1.2fr_.8fr] gap-3 p-4"><div className="relative overflow-hidden rounded-[2rem]"><img src={p.image} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-5 left-5 rounded-full bg-white px-4 py-2 text-[7px] font-bold uppercase">120 m from the beach</span></div><div className="flex flex-col justify-between rounded-[2rem] bg-white p-6"><Copy template={template} sans /><div className="grid grid-cols-2 gap-2 text-[7px] uppercase"><span>Sea view</span><span>Kitchen</span><span>Parking</span><span>Terrace</span></div></div></div></div><div className="grid h-[115px] grid-cols-[.75fr_1.25fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>

    case "holiday-home-collection":
      return <><div className="bg-[#f7f4ef] text-[#222]"><Nav template={template} dark={false} /><div className="grid h-[385px] grid-cols-[.72fr_1.28fr]"><aside className="border-r p-6"><Copy template={template} sans /><div className="mt-5 space-y-2 text-[8px]"><div className="border p-3">Destination</div><div className="border p-3">Property type</div><div className="p-3 text-center text-white" style={{ backgroundColor: p.accent }}>Search homes</div></div></aside><div className="grid grid-cols-2 gap-3 p-4"><div className="relative row-span-2"><img src={p.image} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white p-2 text-[7px] uppercase">Country villa</span></div><div className="relative"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white p-2 text-[7px] uppercase">City apartment</span></div><div className="flex items-center justify-center border text-center"><div><p className="text-3xl font-bold">24</p><p className="text-[7px] uppercase">Homes available</p></div></div></div></div></div><div className="grid h-[105px] grid-cols-3 divide-x bg-white text-center"><span>Map search</span><span>Instant booking</span><span>Local support</span></div></>

    default:
      return <><div className="relative h-[430px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/40" /><Nav template={template} /><div className="relative z-10 flex h-[360px] items-center px-8"><Copy template={template} inverse /></div></div><div className="p-6"><Booking accent={p.accent} /></div></>
  }
}

function RealisticHomepage({ template }: PreviewProps) {
  return <div className="overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-[0_24px_70px_-38px_rgba(0,0,0,.65)]"><BrowserChrome /><Canvas template={template} /></div>
}

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return (
    <article className={`group overflow-hidden rounded-xl border bg-background transition duration-300 ${selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-foreground/40"}`}>
      <RealisticHomepage template={template} />
      <div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]">
        <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">{template.collection}</span>{selected && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary-foreground"><Check className="h-3 w-3" /> Selezionato</span>}</div><h2 className="font-serif text-2xl font-normal tracking-[-.025em]">{template.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p></div>
        <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Ideale per</p><p className="mt-2 text-sm leading-6">{template.idealFor.join(" · ")}</p><p className="mt-3 text-[10px] uppercase tracking-[.15em] text-muted-foreground">{template.features.slice(0, 3).join(" / ")}</p></div>
      </div>
    </article>
  )
}
