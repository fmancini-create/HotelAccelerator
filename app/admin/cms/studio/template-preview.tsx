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
  return <div className="flex h-7 items-center gap-1.5 border-b border-black/10 bg-[#eceae6] px-3"><span className="h-2 w-2 rounded-full bg-[#f26b5e]" /><span className="h-2 w-2 rounded-full bg-[#e8b64b]" /><span className="h-2 w-2 rounded-full bg-[#62b46f]" /><div className="mx-auto h-3.5 w-2/5 rounded bg-white/70" /></div>
}

function Nav({ template, dark = true, centered = false, transparent = false }: PreviewProps & { dark?: boolean; centered?: boolean; transparent?: boolean }) {
  const tone = dark ? "text-white border-white/25" : "text-[#202020] border-black/10"
  return <header className={`relative z-10 flex items-center justify-between border-b px-5 py-4 text-[7px] uppercase tracking-[.2em] sm:px-7 ${tone} ${transparent ? "absolute inset-x-0 top-0" : ""}`}><div className="font-serif text-[11px] normal-case tracking-normal">{template.preview.eyebrow}</div><nav className={`${centered ? "absolute left-1/2 -translate-x-1/2" : ""} hidden items-center gap-4 md:flex`}>{template.preview.nav.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</nav><div className="flex items-center gap-3"><span className="hidden border-b pb-1 sm:inline">Book now</span><Menu className="h-3.5 w-3.5" /></div></header>
}

function Booking({ accent, vertical = false, compact = false, floating = false }: { accent: string; vertical?: boolean; compact?: boolean; floating?: boolean }) {
  if (vertical) return <div className="w-36 bg-white p-3 text-[#191919] shadow-2xl"><p className="text-[6px] uppercase tracking-[.2em] text-black/40">Book your stay</p>{["Check-in", "Check-out", "Guests"].map((item) => <div key={item} className="border-b py-2"><p className="text-[6px] uppercase text-black/40">{item}</p><p className="text-[9px]">Select</p></div>)}<div className="mt-3 py-2 text-center text-[7px] font-semibold uppercase tracking-[.15em] text-white" style={{ backgroundColor: accent }}>Check</div></div>
  return <div className={`grid items-center border border-black/10 bg-white text-[#1f1f1f] ${floating ? "shadow-2xl" : "shadow-lg"} ${compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"}`}><div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-in</p><p className="mt-1 text-[9px]">12 Oct</p></div><div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Check-out</p><p className="mt-1 text-[9px]">15 Oct</p></div>{!compact && <div className="border-r px-3 py-2"><p className="text-[6px] uppercase tracking-[.2em] text-black/45">Guests</p><p className="mt-1 text-[9px]">2 Adults</p></div>}<div className="flex h-full min-w-20 items-center justify-center px-3 text-[7px] font-semibold uppercase tracking-[.16em] text-white" style={{ backgroundColor: accent }}>Check</div></div>
}

function HeroText({ template, align = "left", sans = false, inverse = false }: PreviewProps & { align?: "left" | "center" | "right"; sans?: boolean; inverse?: boolean }) {
  const alignClass = align === "center" ? "items-center text-center" : align === "right" ? "items-end text-right" : "items-start text-left"
  return <div className={`flex flex-col ${alignClass}`}><p className={`text-[7px] uppercase tracking-[.28em] ${inverse ? "text-white/75" : "opacity-55"}`}>{template.collection}</p><h3 className={`${sans ? "font-sans font-bold" : "font-serif font-normal"} mt-4 text-4xl leading-[.92] tracking-[-.045em] sm:text-5xl`}>{template.preview.headline}</h3><p className={`mt-4 max-w-sm text-[9px] leading-relaxed sm:text-[10px] ${inverse ? "text-white/80" : "opacity-60"}`}>{template.preview.subheadline}</p><span className="mt-5 inline-flex items-center gap-2 text-[7px] uppercase tracking-[.2em]">Discover <MoveUpRight className="h-3 w-3" /></span></div>
}

function LuxuryEditorial({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="relative h-[440px] overflow-hidden bg-neutral-900 text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/25 to-transparent" /><Nav template={template} /><div className="relative z-10 grid h-[380px] grid-cols-[1.35fr_.65fr] px-7 py-10"><div className="flex flex-col justify-between"><HeroText template={template} inverse /><span className="text-[7px] uppercase tracking-[.25em] text-white/65">01 · A private world</span></div><div className="flex items-end justify-end"><Booking accent={p.accent} vertical /></div></div></div><div className="grid h-[145px] grid-cols-[1.2fr_.8fr] bg-[#f2ede4]"><div className="p-7"><p className="text-[6px] uppercase tracking-[.25em] text-black/40">The journal</p><p className="mt-3 max-w-xs font-serif text-2xl leading-tight">Stories, rituals and places worth slowing down for.</p></div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></>
}

function LuxuryClassic({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f6f0e7] text-[#2d261f]"><Nav template={template} dark={false} centered /><div className="grid h-[365px] grid-cols-[.8fr_1.2fr]"><div className="flex items-center justify-center px-8"><HeroText template={template} align="center" /></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-5 border border-white/60" /></div></div></div><div className="relative -mt-5 px-8"><Booking accent={p.accent} floating /></div><div className="grid h-[120px] grid-cols-3 bg-white p-6 text-center"><div><p className="font-serif text-xl">Suites</p><p className="text-[7px] uppercase tracking-widest text-black/40">Private spaces</p></div><div className="border-x"><p className="font-serif text-xl">Dining</p><p className="text-[7px] uppercase tracking-widest text-black/40">Fine cuisine</p></div><div><p className="font-serif text-xl">Concierge</p><p className="text-[7px] uppercase tracking-widest text-black/40">Tailored service</p></div></div></>
}

function BoutiqueRomantic({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f8efe7] text-[#33251f]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-[.92fr_1.08fr] gap-8 px-8 py-7"><div className="relative flex items-center"><div className="absolute left-4 top-2 h-[275px] w-[78%] rotate-[-3deg] bg-white p-2 shadow-xl"><img src={p.image} alt="" className="h-full w-full object-cover" /></div><div className="absolute bottom-3 right-0 h-[155px] w-[55%] rotate-3 bg-white p-2 shadow-xl"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></div><div className="flex flex-col justify-center"><HeroText template={template} /><p className="mt-7 border-l-2 pl-4 font-serif text-sm italic" style={{ borderColor: p.accent }}>Hosted with care, remembered with affection.</p></div></div></div><div className="grid h-[105px] grid-cols-[1fr_auto] items-center bg-white px-8"><p className="font-serif text-xl">Three rooms. One very personal story.</p><div className="w-64"><Booking accent={p.accent} compact /></div></div></>
}

function BoutiqueMinimal({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f3f1ec] text-[#171717]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-12 gap-3 p-5"><div className="col-span-4 flex flex-col justify-between bg-white p-6"><p className="text-[7px] uppercase tracking-[.3em]" style={{ color: p.accent }}>{p.eyebrow}</p><HeroText template={template} sans /><span className="text-[7px] uppercase tracking-[.2em]">Issue 01 / Stay</span></div><img src={p.image} alt="" className="col-span-5 h-full w-full object-cover" /><div className="col-span-3 grid grid-rows-2 gap-3"><div className="p-5 text-white" style={{ backgroundColor: p.accent }}><p className="text-[7px] uppercase tracking-widest">Now</p><p className="mt-4 text-2xl font-semibold leading-tight">Rooms with character.</p></div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover grayscale" /></div></div></div><div className="bg-[#151515] px-6 py-5 text-white"><Booking accent={p.accent} compact /></div></>
}

function WellnessOrganic({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="relative h-[500px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/30" /><Nav template={template} transparent /><div className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center"><p className="text-[7px] uppercase tracking-[.4em]">Breathe · Move · Restore</p><h3 className="mt-5 max-w-xl font-serif text-6xl leading-[.86] tracking-[-.05em]">{p.headline}</h3><p className="mt-5 max-w-sm text-[10px] leading-relaxed text-white/85">{p.subheadline}</p><div className="mt-8 h-14 w-px bg-white/60" /></div></div><div className="grid h-[115px] grid-cols-[1fr_auto] items-center gap-5 px-7" style={{ backgroundColor: p.background, color: p.foreground }}><div><p className="text-[7px] uppercase tracking-[.25em] opacity-50">Choose your rhythm</p><p className="mt-2 font-serif text-xl">Retreats · Rituals · Nourishment</p></div><div className="w-72"><Booking accent={p.accent} /></div></div></>
}

function WellnessContemporary({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#202726] text-white"><Nav template={template} /><div className="grid h-[365px] grid-cols-[1.08fr_.92fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-5 left-5 rounded-full bg-white/90 px-4 py-2 text-[7px] uppercase tracking-[.2em] text-black">Book a treatment</div></div><div className="flex flex-col justify-center px-8"><p className="text-[7px] uppercase tracking-[.28em] text-white/50">Science meets wellbeing</p><h3 className="mt-4 font-serif text-4xl leading-[.94]">{p.headline}</h3><p className="mt-4 text-[10px] leading-relaxed text-white/65">{p.subheadline}</p><div className="mt-7 grid grid-cols-2 gap-2 text-[7px] uppercase tracking-widest"><span className="border border-white/25 p-3">Treatments</span><span className="border border-white/25 p-3">Programmes</span><span className="border border-white/25 p-3">Day spa</span><span className="border border-white/25 p-3">Diagnostics</span></div></div></div></div><div className="grid h-[120px] grid-cols-[.75fr_1.25fr] bg-[#f3eee7]"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function FamilySunshine({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#fff6e4] text-[#24354a]"><Nav template={template} dark={false} /><div className="grid h-[365px] grid-cols-[1fr_.72fr] gap-3 p-4"><div className="relative overflow-hidden rounded-[2rem]"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/65 to-transparent" /><div className="absolute bottom-6 left-6 max-w-sm text-white"><p className="text-[7px] uppercase tracking-[.25em]">{p.eyebrow}</p><h3 className="mt-3 text-4xl font-bold leading-[.92]">{p.headline}</h3></div></div><div className="grid grid-rows-2 gap-3"><div className="rounded-[2rem] p-5" style={{ backgroundColor: p.accent }}><p className="text-[7px] uppercase tracking-widest text-white/70">Today</p><p className="mt-3 text-2xl font-bold text-white">Pool, games and little adventures</p></div><div className="relative overflow-hidden rounded-[2rem]"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-4 left-4 rounded-full bg-white px-3 py-2 text-[7px] font-bold uppercase">See activities</span></div></div></div></div><div className="grid h-[120px] grid-cols-[1fr_auto] items-center bg-white px-7"><p className="text-xl font-bold">Everything families need, at a glance.</p><div className="w-72"><Booking accent={p.accent} /></div></div></>
}

function FamilyElegant({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f0eae1] text-[#26322f]"><Nav template={template} dark={false} centered /><div className="relative h-[370px]"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-[#26322f]/90 via-[#26322f]/45 to-transparent" /><div className="relative z-10 flex h-full w-[52%] items-center px-8 text-white"><HeroText template={template} inverse /></div></div></div><div className="grid h-[145px] grid-cols-[.7fr_1.3fr] bg-white"><div className="flex flex-col justify-center px-7"><p className="font-serif text-xl">Family concierge</p><p className="mt-2 text-[8px] leading-relaxed text-black/50">Baby equipment, tailored activities and flexible dining.</p></div><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function BusinessUrban({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#18202d] text-white"><Nav template={template} /><div className="grid h-[390px] grid-cols-[.7fr_1.3fr]"><div className="flex flex-col justify-between border-r border-white/10 p-7"><HeroText template={template} sans inverse /><div className="grid grid-cols-2 gap-2 text-[7px] uppercase tracking-widest text-white/60"><span>24h desk</span><span>Fast Wi-Fi</span><span>Meeting</span><span>City centre</span></div></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-5 right-5 bg-white p-4 text-black shadow-xl"><p className="text-[7px] uppercase tracking-widest">Next meeting</p><p className="mt-2 text-xl font-semibold">8 minutes away</p></div></div></div></div><div className="grid h-[115px] grid-cols-[.55fr_1.45fr] bg-white text-black"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover grayscale" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function BusinessDirect({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-white text-[#10242b]"><div className="flex items-center justify-between bg-[#10242b] px-6 py-2 text-[7px] uppercase tracking-[.18em] text-white"><span>Best rate guaranteed</span><span>Free cancellation · Direct benefits</span></div><Nav template={template} dark={false} /><div className="grid h-[350px] grid-cols-[1.05fr_.95fr]"><div className="flex flex-col justify-center px-8"><span className="w-fit rounded-full px-3 py-1 text-[7px] font-semibold uppercase text-white" style={{ backgroundColor: p.accent }}>Book direct</span><HeroText template={template} sans /><div className="mt-6"><Booking accent={p.accent} /></div></div><img src={p.image} alt="" className="h-full w-full object-cover" /></div></div><div className="grid h-[120px] grid-cols-3 divide-x bg-[#eef5f5] p-5 text-center"><div><p className="text-xl font-bold">-10%</p><p className="text-[7px] uppercase tracking-wider">Direct rate</p></div><div><p className="text-xl font-bold">Free</p><p className="text-[7px] uppercase tracking-wider">Late check-out</p></div><div><p className="text-xl font-bold">24/7</p><p className="text-[7px] uppercase tracking-wider">Support</p></div></div></>
}

function CountryAuthentic({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f4efe5] text-[#2d3427]"><Nav template={template} dark={false} /><div className="grid h-[390px] grid-cols-[1.15fr_.85fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-0 right-0 w-44 bg-[#f4efe5] p-5"><p className="text-[7px] uppercase tracking-widest opacity-50">From our farm</p><p className="mt-2 font-serif text-xl">Seasonal table, local hands.</p></div></div><div className="flex flex-col justify-center px-8"><HeroText template={template} /><div className="mt-6 flex gap-4 text-[7px] uppercase tracking-widest opacity-55"><span>Farm</span><span>Taste</span><span>Walk</span></div></div></div></div><div className="grid h-[125px] grid-cols-[.65fr_1.35fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function CountryWine({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#3a2924] text-[#f5eddf]"><Nav template={template} centered /><div className="grid h-[380px] grid-cols-[.62fr_1.38fr]"><div className="flex flex-col justify-center px-7"><p className="text-[7px] uppercase tracking-[.3em] text-white/45">Estate no. 04</p><h3 className="mt-5 font-serif text-4xl leading-[.94]">{p.headline}</h3><p className="mt-4 text-[9px] leading-relaxed text-white/60">{p.subheadline}</p><div className="mt-7 border-t border-white/20 pt-4 text-[7px] uppercase tracking-widest">Cellar · Suites · Table</div></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-6 border border-white/45" /></div></div></div></div><div className="grid h-[135px] grid-cols-[.9fr_1.1fr] bg-[#f5eddf] text-[#3a2924]"><div className="grid grid-cols-2"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center p-5 font-serif text-xl">Taste the estate.</div></div><div className="flex items-center px-6"><Booking accent={p.accent} /></div></div></>
}

function BBElegant({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#fbf4ec] text-[#33251f]"><Nav template={template} dark={false} /><div className="grid h-[375px] grid-cols-[.95fr_1.05fr] gap-7 p-7"><div className="flex flex-col justify-center"><p className="text-[7px] uppercase tracking-[.28em]" style={{ color: p.accent }}>Welcome from your hosts</p><HeroText template={template} /><div className="mt-6 flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-black/10" /><div><p className="font-serif text-sm">Anna & Marco</p><p className="text-[7px] uppercase tracking-widest opacity-45">Your local hosts</p></div></div></div><div className="relative"><img src={p.image} alt="" className="h-[82%] w-full object-cover" /><img src={p.secondaryImage} alt="" className="absolute bottom-0 left-[-14%] h-[42%] w-[50%] border-8 border-[#fbf4ec] object-cover" /></div></div></div><div className="grid h-[115px] grid-cols-[1fr_auto] items-center bg-white px-7"><p className="font-serif text-xl">Breakfast included. Advice always personal.</p><div className="w-64"><Booking accent={p.accent} compact /></div></div></>
}

function BBSmart({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f4f3ef] text-[#20252a]"><Nav template={template} dark={false} /><div className="grid h-[365px] grid-cols-[.92fr_1.08fr]"><div className="flex flex-col justify-center px-7"><span className="w-fit rounded-full px-3 py-1 text-[7px] font-bold uppercase text-white" style={{ backgroundColor: p.accent }}>Self check-in</span><HeroText template={template} sans /><div className="mt-6 grid grid-cols-2 gap-2 text-[7px] uppercase tracking-widest"><span className="border p-3">Central location</span><span className="border p-3">Smart access</span><span className="border p-3">Fast Wi-Fi</span><span className="border p-3">Local map</span></div></div><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-4 left-4 right-4"><Booking accent={p.accent} compact floating /></div></div></div></div><div className="grid h-[105px] grid-cols-3 bg-[#20252a] p-5 text-center text-white"><div><p className="text-xl font-bold">3 min</p><p className="text-[7px] uppercase opacity-55">Station</p></div><div><p className="text-xl font-bold">24/7</p><p className="text-[7px] uppercase opacity-55">Access</p></div><div><p className="text-xl font-bold">100%</p><p className="text-[7px] uppercase opacity-55">Direct</p></div></div></>
}

function MountainChalet({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="relative h-[500px] overflow-hidden text-white"><img src={p.image} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-black/10" /><Nav template={template} transparent /><div className="relative z-10 flex h-full items-end px-8 pb-10"><div className="grid w-full grid-cols-[1fr_auto] items-end"><div><p className="text-[7px] uppercase tracking-[.35em]">Private alpine hideaway</p><h3 className="mt-4 max-w-lg font-serif text-6xl leading-[.85]">{p.headline}</h3><p className="mt-4 max-w-sm text-[10px] text-white/75">{p.subheadline}</p></div><div className="rounded-full border border-white/50 px-5 py-5 text-center text-[7px] uppercase tracking-widest">Explore<br />the chalet</div></div></div></div><div className="grid h-[120px] grid-cols-[.8fr_1.2fr] bg-[#202523] text-white"><div className="flex items-center px-7 font-serif text-xl">Fireplace evenings. Wild mornings.</div><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function MountainResort({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#edf1ef] text-[#1c2b28]"><Nav template={template} dark={false} centered /><div className="grid h-[370px] grid-cols-[1.2fr_.8fr]"><div className="relative"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute left-5 top-5 grid gap-2"><span className="bg-white px-3 py-2 text-[7px] uppercase tracking-widest">Winter</span><span className="bg-white px-3 py-2 text-[7px] uppercase tracking-widest">Summer</span><span className="bg-white px-3 py-2 text-[7px] uppercase tracking-widest">Spa</span></div></div><div className="flex flex-col justify-center px-7"><HeroText template={template} /><div className="mt-6"><Booking accent={p.accent} compact /></div></div></div></div><div className="grid h-[125px] grid-cols-4 bg-white text-center"><div className="flex flex-col justify-center"><p className="font-serif text-lg">Ski</p><p className="text-[7px] uppercase opacity-45">From the door</p></div><div className="flex flex-col justify-center border-x"><p className="font-serif text-lg">Spa</p><p className="text-[7px] uppercase opacity-45">After the mountain</p></div><div className="flex flex-col justify-center border-r"><p className="font-serif text-lg">Hike</p><p className="text-[7px] uppercase opacity-45">Four seasons</p></div><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /></div></>
}

function HolidayCoastal({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#edf8fa] text-[#153a43]"><Nav template={template} dark={false} /><div className="grid h-[370px] grid-cols-[1.2fr_.8fr] gap-3 p-4"><div className="relative overflow-hidden rounded-[2rem]"><img src={p.image} alt="" className="h-full w-full object-cover" /><div className="absolute bottom-5 left-5 rounded-full bg-white/90 px-4 py-2 text-[7px] font-bold uppercase">120 m from the beach</div></div><div className="flex flex-col justify-between rounded-[2rem] bg-white p-6"><HeroText template={template} sans /><div className="grid grid-cols-2 gap-2 text-[7px] uppercase tracking-widest"><span>Sea view</span><span>Kitchen</span><span>Parking</span><span>Terrace</span></div></div></div></div><div className="grid h-[115px] grid-cols-[.75fr_1.25fr] bg-white"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><div className="flex items-center px-7"><Booking accent={p.accent} /></div></div></>
}

function HolidayCollection({ template }: PreviewProps) {
  const p = template.preview
  return <><div className="bg-[#f7f4ef] text-[#222]"><Nav template={template} dark={false} /><div className="grid h-[385px] grid-cols-[.72fr_1.28fr]"><aside className="border-r p-6"><p className="text-[7px] uppercase tracking-[.3em]" style={{ color: p.accent }}>Find your place</p><h3 className="mt-5 text-4xl font-bold leading-[.92]">{p.headline}</h3><p className="mt-4 text-[9px] leading-relaxed opacity-55">{p.subheadline}</p><div className="mt-6 space-y-2 text-[8px]"><div className="border p-3">Destination</div><div className="border p-3">Property type</div><div className="border p-3">Guests</div><div className="p-3 text-center text-white" style={{ backgroundColor: p.accent }}>Search homes</div></div></aside><div className="grid grid-cols-2 gap-3 p-4"><div className="relative row-span-2 overflow-hidden"><img src={p.image} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white px-3 py-2 text-[7px] font-bold uppercase">Country villa</span></div><div className="relative overflow-hidden"><img src={p.secondaryImage} alt="" className="h-full w-full object-cover" /><span className="absolute bottom-3 left-3 bg-white px-3 py-2 text-[7px] font-bold uppercase">City apartment</span></div><div className="flex items-center justify-center border text-center"><div><p className="text-3xl font-bold">24</p><p className="text-[7px] uppercase tracking-widest opacity-45">Homes available</p></div></div></div></div></div><div className="grid h-[105px] grid-cols-3 divide-x bg-white text-center"><div className="flex flex-col justify-center"><p className="font-semibold">Map search</p><p className="text-[7px] uppercase opacity-45">Explore visually</p></div><div className="flex flex-col justify-center"><p className="font-semibold">Instant booking</p><p className="text-[7px] uppercase opacity-45">Real availability</p></div><div className="flex flex-col justify-center"><p className="font-semibold">Local support</p><p className="text-[7px] uppercase opacity-45">Before and during</p></div></div></>
}

const PREVIEWS: Record<string, (props: PreviewProps) => React.ReactNode> = {
  "luxury-editorial": LuxuryEditorial,
  "luxury-classic": LuxuryClassic,
  "boutique-romantic": BoutiqueRomantic,
  "boutique-minimal": BoutiqueMinimal,
  "wellness-organic": WellnessOrganic,
  "wellness-contemporary": WellnessContemporary,
  "family-sunshine": FamilySunshine,
  "family-elegant": FamilyElegant,
  "business-urban": BusinessUrban,
  "business-direct": BusinessDirect,
  "country-authentic": CountryAuthentic,
  "country-wine": CountryWine,
  "bb-elegant": BBElegant,
  "bb-smart": BBSmart,
  "mountain-chalet": MountainChalet,
  "mountain-resort": MountainResort,
  "holiday-home-coastal": HolidayCoastal,
  "holiday-home-collection": HolidayCollection,
}

function RealisticHomepage({ template }: PreviewProps) {
  const Preview = PREVIEWS[template.id] ?? LuxuryEditorial
  return <div className="overflow-hidden rounded-t-xl border border-b-0 bg-white shadow-[0_24px_70px_-38px_rgba(0,0,0,.65)]"><BrowserChrome /><Preview template={template} /></div>
}

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return <article className={`group overflow-hidden rounded-xl border bg-background transition duration-300 ${selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-foreground/40"}`}><RealisticHomepage template={template} /><div className="grid gap-5 p-5 lg:grid-cols-[1.2fr_.8fr]"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">{template.collection}</span>{selected && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-primary-foreground"><Check className="h-3 w-3" /> Selezionato</span>}</div><h2 className="font-serif text-2xl font-normal tracking-[-.025em]">{template.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p></div><div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Ideale per</p><p className="mt-2 text-sm leading-6">{template.idealFor.join(" · ")}</p><p className="mt-3 text-[10px] uppercase tracking-[.15em] text-muted-foreground">{template.features.slice(0, 3).join(" / ")}</p></div></div></article>
}
