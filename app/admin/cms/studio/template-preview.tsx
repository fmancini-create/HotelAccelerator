"use client"

import { Check, MoveUpRight } from "lucide-react"

export type StudioTemplate = {
  id: string
  name: string
  category: string
  description: string
  idealFor: string[]
  features: string[]
  preview: {
    eyebrow: string
    headline: string
    accent: string
    background: string
    foreground: string
  }
}

const categoryLabel: Record<string, string> = {
  luxury: "Luxury resort",
  boutique: "Boutique hotel",
  wellness: "Wellness retreat",
  family: "Family collection",
  business: "Urban hospitality",
  country: "Country escape",
}

function VisualPanel({ template }: { template: StudioTemplate }) {
  const isDark = ["luxury", "business"].includes(template.category)

  return (
    <div
      className="relative min-h-[420px] overflow-hidden"
      style={{ backgroundColor: template.preview.background, color: template.preview.foreground }}
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background: `radial-gradient(circle at 82% 18%, ${template.preview.accent}55, transparent 32%), linear-gradient(145deg, transparent 12%, ${template.preview.foreground}12 48%, transparent 72%)`,
        }}
      />

      <div className="absolute right-[-8%] top-[15%] h-[58%] w-[54%] rotate-3 overflow-hidden rounded-[38%_8%_34%_8%] border border-white/30 shadow-2xl">
        <div
          className="h-full w-full"
          style={{
            background: `linear-gradient(135deg, ${template.preview.accent}, ${template.preview.foreground})`,
          }}
        >
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,.48),transparent_24%),linear-gradient(160deg,transparent_30%,rgba(0,0,0,.28))]" />
        </div>
      </div>

      <div className="absolute bottom-[9%] right-[8%] h-[25%] w-[29%] -rotate-2 overflow-hidden rounded-[4px_42px_4px_42px] border border-white/40 shadow-xl">
        <div className="h-full w-full" style={{ background: `linear-gradient(155deg, ${template.preview.foreground}, ${template.preview.accent})` }} />
      </div>

      <div className="relative z-10 flex min-h-[420px] flex-col p-7 sm:p-8">
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.28em]">
          <span>{template.preview.eyebrow}</span>
          <span className="border-b pb-1" style={{ borderColor: template.preview.accent }}>Menu</span>
        </div>

        <div className="my-auto max-w-[64%] py-10">
          <p className="mb-4 text-[10px] uppercase tracking-[0.32em] opacity-70">Italian hospitality</p>
          <h3 className="font-serif text-[clamp(2.25rem,4.2vw,4.5rem)] font-normal leading-[0.92] tracking-[-0.045em]">
            {template.preview.headline}
          </h3>
          <div className="mt-7 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.24em]">
            <span>Discover</span>
            <span className="h-px w-12" style={{ backgroundColor: template.preview.accent }} />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-5">
          <div className="max-w-[58%] text-[11px] leading-relaxed opacity-70">
            Rooms · Experiences · Dining · Wellness
          </div>
          <div
            className={`flex h-14 min-w-36 items-center justify-between gap-5 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? "bg-white text-black" : "bg-black text-white"}`}
          >
            Book your stay
            <MoveUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return (
    <article className={`group overflow-hidden border bg-background transition duration-500 ${selected ? "border-foreground shadow-[0_22px_70px_-35px_rgba(0,0,0,.55)]" : "border-border/70 hover:border-foreground/40"}`}>
      <VisualPanel template={template} />

      <div className="grid gap-6 p-6 lg:grid-cols-[1.3fr_.7fr] lg:p-7">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {categoryLabel[template.category] || template.category}
            </span>
            <span className="h-px w-8 bg-border" />
            {selected && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em]"><Check className="h-3 w-3" /> Selezionato</span>}
          </div>
          <h2 className="font-serif text-3xl font-normal tracking-[-0.03em]">{template.name}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{template.description}</p>
        </div>

        <div className="space-y-4 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Highlights</p>
            <p className="mt-2 text-sm leading-6">{template.features.slice(0, 3).join(" · ")}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ideale per</p>
            <p className="mt-2 text-sm leading-6">{template.idealFor.join(", ")}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
