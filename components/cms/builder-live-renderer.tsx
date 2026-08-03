"use client"

import type { CSSProperties, ReactNode } from "react"
import type { CMSBuilderDocument } from "@/lib/cms/builder-document"

type Breakpoint = "desktop" | "tablet" | "mobile"
type Page = CMSBuilderDocument["pages"][number]
type Section = Page["sections"][number]
type Element = Section["elements"][number]

const sectionNames: Record<string, string> = {
  rooms: "Sistemazioni",
  spa: "Benessere",
  restaurant: "Ristorazione",
  gallery: "Gallery",
  offers: "Offerte",
  reviews: "Recensioni",
  contact: "Contatti",
  content: "Esperienze",
  custom: "Scopri",
}

function radiusClass(radius: CMSBuilderDocument["designTokens"]["radius"]) {
  return radius === "none" ? "rounded-none" : radius === "small" ? "rounded-md" : radius === "large" ? "rounded-[2rem]" : "rounded-xl"
}

function spacingClass(scale: CMSBuilderDocument["designTokens"]["spacingScale"]) {
  return scale === "compact" ? "py-10 md:py-14" : scale === "relaxed" ? "py-20 md:py-32" : "py-14 md:py-20"
}

function sectionLayout(variant: string) {
  const value = variant.toLowerCase()
  if (value.includes("fullscreen") || value.includes("immersive") || value.includes("cinematic")) return "immersive"
  if (value.includes("split") || value.includes("side") || value.includes("editorial")) return "split"
  if (value.includes("grid") || value.includes("catalog") || value.includes("cards") || value.includes("collection")) return "grid"
  if (value.includes("center") || value.includes("classic") || value.includes("monumental")) return "center"
  if (value.includes("compact") || value.includes("conversion") || value.includes("direct")) return "compact"
  return "default"
}

function orderedElements(section: Section, breakpoint: Breakpoint) {
  return [...section.elements]
    .filter((element) => !element.placement[breakpoint].hidden)
    .sort((a, b) => a.placement[breakpoint].order - b.placement[breakpoint].order)
}

function BookingWidget({ element, colors, radius }: { element: Extract<Element, { type: "booking-widget" }>; colors: CMSBuilderDocument["designTokens"]["colors"]; radius: string }) {
  if (element.mode === "button") {
    return <button className={`${radius} px-6 py-3 text-sm font-semibold text-white shadow-lg`} style={{ backgroundColor: colors.primary }}>{element.label}</button>
  }
  if (element.mode === "inline") {
    return <div className={`inline-flex items-center gap-3 border px-4 py-3 ${radius}`} style={{ borderColor: colors.secondary, backgroundColor: colors.background }}><span className="text-sm">Date e ospiti</span><button className={`${radius} px-4 py-2 text-sm font-semibold text-white`} style={{ backgroundColor: colors.primary }}>{element.label}</button></div>
  }
  return <div className={`grid gap-3 border p-4 shadow-xl md:grid-cols-[1fr_1fr_1fr_auto] ${radius}`} style={{ backgroundColor: colors.background, borderColor: `${colors.secondary}66` }}><div className="border-b p-2 text-sm md:border-b-0 md:border-r">Arrivo</div><div className="border-b p-2 text-sm md:border-b-0 md:border-r">Partenza</div><div className="p-2 text-sm">Ospiti</div><button className={`${radius} px-5 py-3 text-sm font-semibold text-white`} style={{ backgroundColor: colors.primary }}>{element.label}</button></div>
}

function RenderElement({ element, document, breakpoint }: { element: Element; document: CMSBuilderDocument; breakpoint: Breakpoint }) {
  const { colors, radius } = document.designTokens
  const rounded = radiusClass(radius)
  const placement = element.placement[breakpoint]
  const style: CSSProperties = {
    gridColumn: `${placement.columnStart} / span ${placement.columnSpan}`,
    alignSelf: placement.align,
  }
  let node: ReactNode = null

  if (element.type === "heading") {
    const sizes = element.level === "h1" ? "text-4xl md:text-6xl lg:text-7xl" : element.level === "h2" ? "text-3xl md:text-5xl" : "text-2xl md:text-3xl"
    node = <div className={`${sizes} leading-[1.05] tracking-tight`} style={{ textAlign: element.textAlign, fontFamily: document.designTokens.typography.headingFamily }}>{element.content}</div>
  }
  if (element.type === "text") node = <p className="max-w-3xl text-base leading-7 opacity-80 md:text-lg" style={{ textAlign: element.textAlign }}>{element.content}</p>
  if (element.type === "button") node = <a href={element.href} target={element.openInNewTab ? "_blank" : undefined} rel={element.openInNewTab ? "noreferrer" : undefined} className={`inline-flex w-fit items-center justify-center px-6 py-3 text-sm font-semibold transition hover:opacity-90 ${rounded}`} style={element.variant === "outline" ? { border: `1px solid ${colors.primary}`, color: colors.primary } : element.variant === "link" ? { color: colors.primary } : { backgroundColor: element.variant === "secondary" ? colors.secondary : colors.primary, color: "white" }}>{element.label}</a>
  if (element.type === "booking-widget") node = <BookingWidget element={element} colors={colors} radius={rounded} />
  if (element.type === "image") node = <img src={element.src} alt={element.alt} className={`min-h-56 w-full object-cover shadow-xl ${rounded}`} style={{ objectFit: element.fit, objectPosition: `${element.focalPoint.x}% ${element.focalPoint.y}%` }} />
  if (element.type === "spacer") node = <div style={{ height: element.height[breakpoint] }} />

  return <div style={style}>{node}</div>
}

function SectionRenderer({ section, document, breakpoint, index }: { section: Section; document: CMSBuilderDocument; breakpoint: Breakpoint; index: number }) {
  const layout = sectionLayout(section.variant)
  const elements = orderedElements(section, breakpoint)
  const { colors } = document.designTokens
  const rounded = radiusClass(document.designTokens.radius)
  const spacing = spacingClass(document.designTokens.spacingScale)
  const backgroundMedia = section.background.mediaId
  const backgroundColor = section.background.color || (index % 2 ? colors.background : colors.accent)
  const isHero = section.type === "hero"

  const sectionStyle: CSSProperties = {
    backgroundColor,
    color: colors.foreground,
    backgroundImage: backgroundMedia ? `linear-gradient(rgba(0,0,0,${section.background.overlayOpacity}),rgba(0,0,0,${section.background.overlayOpacity})), url(${backgroundMedia})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  }

  if (layout === "immersive") {
    return <section className={`relative flex min-h-[72vh] items-end overflow-hidden px-6 pb-12 pt-28 md:px-12 md:pb-20 ${isHero ? "min-h-[86vh]" : ""}`} style={sectionStyle}><div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" /><div className="relative z-10 grid w-full max-w-7xl gap-6 text-white md:grid-cols-12">{elements.map((element) => <RenderElement key={element.id} element={element} document={document} breakpoint={breakpoint} />)}</div></section>
  }

  if (layout === "split") {
    const images = elements.filter((element) => element.type === "image")
    const content = elements.filter((element) => element.type !== "image")
    return <section className={`${spacing} px-5 md:px-10`} style={sectionStyle}><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2"><div className="grid grid-cols-12 gap-5">{content.map((element) => <RenderElement key={element.id} element={element} document={document} breakpoint={breakpoint} />)}</div><div className={`min-h-72 overflow-hidden ${rounded}`} style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})` }}>{images.length ? images.map((element) => <RenderElement key={element.id} element={element} document={document} breakpoint={breakpoint} />) : <div className="flex min-h-96 items-end p-8 text-white"><span className="text-xs uppercase tracking-[.25em]">{section.label}</span></div>}</div></div></section>
  }

  if (layout === "grid") {
    return <section className={`${spacing} px-5 md:px-10`} style={sectionStyle}><div className="mx-auto max-w-7xl"><div className="mb-8 flex items-end justify-between gap-4"><span className="text-xs font-semibold uppercase tracking-[.2em] opacity-60">{sectionNames[section.type] || section.label}</span><span className="text-sm opacity-50">{section.variant}</span></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">{elements.map((element) => <div key={element.id} className={`border p-5 ${rounded}`} style={{ borderColor: `${colors.secondary}44`, backgroundColor: `${colors.background}CC` }}><RenderElement element={element} document={document} breakpoint={breakpoint} /></div>)}</div></div></section>
  }

  if (layout === "compact") {
    return <section className="border-y px-5 py-7 md:px-10" style={{ ...sectionStyle, borderColor: `${colors.secondary}55` }}><div className="mx-auto grid max-w-7xl items-center gap-5 md:grid-cols-12">{elements.map((element) => <RenderElement key={element.id} element={element} document={document} breakpoint={breakpoint} />)}</div></section>
  }

  return <section className={`${spacing} px-5 md:px-10`} style={sectionStyle}><div className={`mx-auto grid max-w-6xl grid-cols-12 gap-6 ${layout === "center" ? "text-center" : ""}`}>{elements.map((element) => <RenderElement key={element.id} element={element} document={document} breakpoint={breakpoint} />)}</div></section>
}

export function BuilderLiveRenderer({ document, pageId, breakpoint = "desktop" }: { document: CMSBuilderDocument; pageId?: string; breakpoint?: Breakpoint }) {
  const page = document.pages.find((item) => item.id === pageId) || document.pages[0]
  const { colors, typography } = document.designTokens
  const visibleNavigation = [...document.navigation].sort((a, b) => a.order - b.order).slice(0, 7)

  return <div className="min-h-screen overflow-hidden" style={{ backgroundColor: colors.background, color: colors.foreground, fontFamily: typography.bodyFamily, fontSize: typography.baseSize }}>
    <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ borderColor: `${colors.secondary}44`, backgroundColor: `${colors.background}E8` }}><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10"><div className="font-semibold tracking-wide" style={{ fontFamily: typography.headingFamily }}>{page.seo.title || "Hotel"}</div><nav className="hidden gap-6 text-sm md:flex">{visibleNavigation.map((item) => <a key={item.id} href={item.href} className="opacity-75 hover:opacity-100">{item.label}</a>)}</nav><a href="#booking" className={`${radiusClass(document.designTokens.radius)} px-4 py-2 text-sm font-semibold text-white`} style={{ backgroundColor: colors.primary }}>Prenota</a></div></header>
    <main>{page.sections.map((section, index) => <SectionRenderer key={section.id} section={section} document={document} breakpoint={breakpoint} index={index} />)}</main>
    <footer className="px-5 py-12 md:px-10" style={{ backgroundColor: colors.foreground, color: colors.background }}><div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 md:flex-row"><div><div className="text-2xl" style={{ fontFamily: typography.headingFamily }}>{page.seo.title || "Hotel"}</div><p className="mt-2 max-w-xl text-sm opacity-70">Anteprima generata dalla bozza CMS. Dati, immagini e collegamenti devono essere verificati prima della pubblicazione.</p></div><div className="text-sm opacity-60">HotelAccelerator CMS</div></div></footer>
  </div>
}
