"use client"

import { Badge } from "@/components/ui/badge"

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

export function TemplatePreview({ template, selected }: { template: StudioTemplate; selected: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="relative aspect-[16/10] p-5" style={{ background: template.preview.background, color: template.preview.foreground }}>
        <div className="mb-8 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em]">
          <span>{template.preview.eyebrow}</span>
          <span className="rounded-full border px-2 py-1">Prenota</span>
        </div>
        <div className="max-w-[82%] text-2xl font-semibold leading-tight">{template.preview.headline}</div>
        <div className="mt-3 h-1 w-14 rounded-full" style={{ background: template.preview.accent }} />
        <div className="absolute inset-x-5 bottom-5 grid grid-cols-3 gap-2">
          <div className="h-10 rounded bg-white/55" />
          <div className="h-10 rounded bg-white/40" />
          <div className="h-10 rounded" style={{ background: template.preview.accent }} />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{template.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
          </div>
          {selected && <Badge>Selezionato</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {template.features.slice(0, 4).map((feature) => <Badge key={feature} variant="outline" className="font-normal">{feature}</Badge>)}
        </div>
        <p className="text-xs text-muted-foreground">Ideale per: {template.idealFor.join(", ")}</p>
      </div>
    </div>
  )
}
