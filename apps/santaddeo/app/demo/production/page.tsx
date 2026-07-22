"use client"

import { DemoPage } from "@/components/sales/demo/demo-page"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { DEMO_PRODUCTION_ROOM_TYPES, DEMO_PRODUCTION_DAYS } from "@/components/sales/demo/mock-data"

const WEEKDAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"]

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(amount)
}

export default function DemoProductionPage() {
  const days = DEMO_PRODUCTION_DAYS
  const roomTypes = DEMO_PRODUCTION_ROOM_TYPES
  const monthTotal = days.reduce((s, d) => s + d.total, 0)
  // "Oggi" finto: giorno 21 di Maggio 2026 per dare il riferimento visivo.
  const todayDate = "2026-05-21"

  return (
    <DemoPage
      title="Produzione"
      narration="Questa pagina mostra i tuoi ricavi giorno per giorno e tipologia di camera. Ogni cella indica quanto ha prodotto quella categoria in una data specifica, con colori che evidenziano le giornate più performanti. È lo strumento che ti permette di capire dove si concentra il fatturato e individuare i giorni deboli da spingere con tariffe dedicate."
    >
      <PageHeader
        title="Produzione"
        description="Hotel Santaddeo - Ricavi per giorno e tipologia camera"
      />

      <div className="bg-muted/50 border-b px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>
          Ultima sincronizzazione: <strong className="text-foreground">28 Mag 2026 alle 06:10</strong>
        </span>
      </div>

      <main className="p-6">
        <div className="mx-auto max-w-[1800px] space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Ricavi per Giorno e Tipologia Camera</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Mese precedente">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-32 text-center">maggio 2026</span>
                  <Button variant="outline" size="icon" aria-label="Mese successivo">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Totale mese: <strong>{formatCurrency(monthTotal)}</strong>
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-left sticky left-0 bg-muted z-10 min-w-[150px]">Tipologia</th>
                      <th className="border p-2 text-center sticky left-[150px] bg-muted z-10">Tot. Mese</th>
                      {days.map((day) => {
                        const d = new Date(day.date)
                        const isToday = day.date === todayDate
                        return (
                          <th
                            key={day.date}
                            className={`border p-1 text-center min-w-[60px] ${
                              isToday ? "bg-blue-600 text-white ring-2 ring-blue-600 ring-inset" : ""
                            }`}
                          >
                            <div className="text-xs">{WEEKDAYS[d.getUTCDay()]}</div>
                            <div className="font-bold">{d.getUTCDate()}</div>
                            {isToday && (
                              <div className="text-[9px] font-semibold uppercase tracking-wider">OGGI</div>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {roomTypes.map((rt) => {
                      const rtTotal = days.reduce((s, d) => s + (d.revenues[rt.code] || 0), 0)
                      return (
                        <tr key={rt.code} className="hover:bg-muted/50">
                          <td className="border p-2 font-medium sticky left-0 bg-background z-10">{rt.name}</td>
                          <td className="border p-2 text-center font-bold sticky left-[150px] bg-background z-10">
                            {rtTotal > 0 ? formatCurrency(rtTotal) : "-"}
                          </td>
                          {days.map((day) => {
                            const revenue = day.revenues[rt.code] || 0
                            const isToday = day.date === todayDate
                            let bgColor = "bg-gray-50"
                            if (revenue >= 200) bgColor = "bg-green-200"
                            else if (revenue >= 100) bgColor = "bg-green-100"
                            else if (revenue > 0) bgColor = "bg-yellow-100"
                            return (
                              <td
                                key={day.date}
                                className={`border p-1 text-center ${bgColor} ${
                                  isToday ? "ring-2 ring-blue-500 ring-inset" : ""
                                }`}
                              >
                                {revenue > 0 ? (
                                  <div className="font-medium text-xs">{Math.round(revenue)}</div>
                                ) : (
                                  <div className="text-muted-foreground">-</div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    <tr className="bg-muted font-bold">
                      <td className="border p-2 sticky left-0 bg-muted z-10">TOTALE</td>
                      <td className="border p-2 text-center sticky left-[150px] bg-muted z-10">
                        {formatCurrency(monthTotal)}
                      </td>
                      {days.map((day) => {
                        const isToday = day.date === todayDate
                        return (
                          <td
                            key={day.date}
                            className={`border p-1 text-center ${
                              isToday ? "bg-blue-100 ring-2 ring-blue-500 ring-inset" : "bg-muted"
                            }`}
                          >
                            <div className="font-bold text-xs">{day.total > 0 ? Math.round(day.total) : "-"}</div>
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex gap-4 text-sm">
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-gray-50 border" /> Nessuna</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-100 border" /> {"< 100"}</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border" /> 100-199</div>
                <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-200 border" /> {">= 200"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </DemoPage>
  )
}
