"use client"

import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent } from "@/components/ui/card"
import { ModuleCard, type ModuleView } from "@/components/admin/module-card"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SECTIONS: { category: ModuleView["category"]; title: string; subtitle: string }[] = [
  { category: "core", title: "Moduli core", subtitle: "Funzioni base della piattaforma." },
  { category: "product", title: "Prodotti", subtitle: "Moduli avanzati attivabili con abbonamento." },
  { category: "addon", title: "Add-on", subtitle: "Estensioni opzionali." },
]

export default function ModulesPage() {
  const { data, error, mutate } = useSWR<{ propertyId: string; modules: ModuleView[] }>(
    "/api/admin/modules",
    fetcher,
  )

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <AdminHeader title="Moduli" subtitle="Attiva o disattiva le funzioni della tua struttura" />
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-muted-foreground">
            Errore nel caricamento dei moduli.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <AdminHeader title="Moduli" subtitle="Attiva o disattiva le funzioni della tua struttura" />
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <AdminHeader title="Moduli" subtitle="Attiva o disattiva le funzioni della tua struttura" />

      <div className="mt-6 space-y-10">
        {SECTIONS.map((section) => {
          const items = data.modules.filter((m) => m.category === section.category)
          if (items.length === 0) return null
          return (
            <section key={section.category}>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="text-sm text-muted-foreground">{section.subtitle}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((m) => (
                  <ModuleCard key={m.key} module={m} onChanged={() => mutate()} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
