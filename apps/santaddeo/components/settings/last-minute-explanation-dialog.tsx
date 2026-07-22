"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Info, TrendingDown, Gauge, Percent, Hash, Euro } from "lucide-react"

/**
 * Two flavours of dialog:
 *  1. Confirm  — short modal asking "Vuoi capire come hai settato il last minute?"
 *  2. Explain  — full walkthrough of the current configuration.
 * Both are mounted from the last-minute levels page after a successful save.
 */

export interface LastMinuteBand {
  min_occupancy_pct: number
  max_occupancy_pct: number
  min_occupancy_num: number
  max_occupancy_num: number
  occupancy_mode: "pct" | "num"
  discount_pct: number
  discount_eur: number
  discount_mode: "pct" | "eur"
  rate_growth_pct: number
  rate_growth_speed: string
  max_recovery_pct: number
}

export interface LastMinuteLevelLite {
  name: string
  color: string
  discount_pct: number
  discount_eur: number
  discount_mode: "pct" | "eur"
  min_occupancy_pct: number
  max_occupancy_pct: number
  occupancy_mode: "pct" | "num"
  min_occupancy_num: number
  max_occupancy_num: number
  occupancy_bands: LastMinuteBand[]
}

const GROWTH_SPEED_LABEL: Record<string, string> = {
  very_slow: "molto lenta",
  slow: "lenta",
  medium: "media",
  fast: "veloce",
  very_fast: "molto veloce",
}

function fmtOccupancy(mode: "pct" | "num", min: number, max: number) {
  return mode === "num" ? `${min}-${max} camere disponibili` : `${min}-${max}% di disponibilità`
}

function fmtDiscount(mode: "pct" | "eur", pct: number, eur: number) {
  return mode === "eur" ? `-${eur} EUR` : `-${pct}%`
}

/* ------------------------------------------------------------------ */
/*  Confirm dialog                                                     */
/* ------------------------------------------------------------------ */

export function LastMinuteConfirmDialog({
  open,
  onCancel,
  onAccept,
}: {
  open: boolean
  onCancel: () => void
  onAccept: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Info className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-pretty">Configurazione salvata</DialogTitle>
              <DialogDescription className="text-pretty">
                Vuoi capire come hai settato il last minute? Ti mostriamo una
                spiegazione della logica applicata ai tuoi livelli.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            No, grazie
          </Button>
          <Button onClick={onAccept} className="gap-2">
            <Info className="h-4 w-4" aria-hidden />
            Sì, spiegamelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Explanation dialog                                                 */
/* ------------------------------------------------------------------ */

export function LastMinuteExplanationDialog({
  open,
  onClose,
  levels,
  occupancyMode,
  discountMode,
  totalRooms,
}: {
  open: boolean
  onClose: () => void
  levels: LastMinuteLevelLite[]
  occupancyMode: "pct" | "num"
  discountMode: "pct" | "eur"
  totalRooms: number
}) {
  const sorted = [...levels].sort((a, b) => {
    if (occupancyMode === "num") return a.min_occupancy_num - b.min_occupancy_num
    return a.min_occupancy_pct - b.min_occupancy_pct
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-pretty">
            <TrendingDown className="h-5 w-5 text-primary" aria-hidden />
            Come hai configurato il last minute
          </DialogTitle>
          <DialogDescription className="text-pretty">
            Ecco una lettura discorsiva della tua configurazione, livello per livello.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 py-5 space-y-6">
            {/* Global settings */}
            <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" aria-hidden />
                Impostazioni generali
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5 leading-relaxed">
                <li className="flex items-start gap-2">
                  {occupancyMode === "pct" ? (
                    <Percent className="h-3.5 w-3.5 mt-1 flex-shrink-0" aria-hidden />
                  ) : (
                    <Hash className="h-3.5 w-3.5 mt-1 flex-shrink-0" aria-hidden />
                  )}
                  <span>
                    <strong className="text-foreground">Occupazione misurata in{" "}
                      {occupancyMode === "pct" ? "percentuale" : "numero di camere"}</strong>
                    {occupancyMode === "num" && totalRooms > 0 && (
                      <> (su un totale di {totalRooms} camere)</>
                    )}
                    . Lo sconto si applica in base alle camere <strong>disponibili</strong>,
                    ovvero quelle ancora da vendere.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  {discountMode === "pct" ? (
                    <Percent className="h-3.5 w-3.5 mt-1 flex-shrink-0" aria-hidden />
                  ) : (
                    <Euro className="h-3.5 w-3.5 mt-1 flex-shrink-0" aria-hidden />
                  )}
                  <span>
                    <strong className="text-foreground">
                      Sconto espresso in {discountMode === "pct" ? "percentuale" : "euro"}
                    </strong>
                    {" "}rispetto alla tariffa base.
                  </span>
                </li>
              </ul>
            </section>

            {/* Per-level walkthrough */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">I tuoi {sorted.length} livelli</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Più camere disponibili = più sconto. Man mano che le camere si
                esauriscono lo sconto scende e la tariffa recupera verso il prezzo pieno.
              </p>

              <ol className="space-y-3">
                {sorted.map((lvl, idx) => {
                  const occRange = fmtOccupancy(
                    occupancyMode,
                    occupancyMode === "num" ? lvl.min_occupancy_num : lvl.min_occupancy_pct,
                    occupancyMode === "num" ? lvl.max_occupancy_num : lvl.max_occupancy_pct
                  )
                  const discLabel = fmtDiscount(discountMode, lvl.discount_pct, lvl.discount_eur)
                  return (
                    <li
                      key={idx}
                      className="rounded-lg border border-border p-4 space-y-3 bg-card"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: lvl.color }}
                          aria-hidden
                        />
                        <span className="font-semibold text-sm">{lvl.name}</span>
                        <Badge variant="outline" className="text-[10px]">{occRange}</Badge>
                        <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
                          Sconto {discLabel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Quando le camere disponibili rientrano in{" "}
                        <strong className="text-foreground">{occRange}</strong>, applichi
                        uno sconto di{" "}
                        <strong className="text-foreground">{discLabel}</strong> sulla
                        tariffa base.
                      </p>

                      {lvl.occupancy_bands && lvl.occupancy_bands.length > 0 && (
                        <div className="rounded-md bg-muted/40 p-3 space-y-2">
                          <p className="text-xs font-medium text-foreground">
                            Fasce interne ({lvl.occupancy_bands.length})
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                            {lvl.occupancy_bands.map((band, bi) => {
                              const bandOcc = fmtOccupancy(
                                band.occupancy_mode,
                                band.occupancy_mode === "num" ? band.min_occupancy_num : band.min_occupancy_pct,
                                band.occupancy_mode === "num" ? band.max_occupancy_num : band.max_occupancy_pct
                              )
                              const bandDisc = fmtDiscount(band.discount_mode, band.discount_pct, band.discount_eur)
                              const speed = GROWTH_SPEED_LABEL[band.rate_growth_speed] || band.rate_growth_speed
                              return (
                                <li key={bi} className="flex gap-2">
                                  <span className="text-foreground font-medium flex-shrink-0">{bi + 1}.</span>
                                  <span>
                                    Con {bandOcc} applichi{" "}
                                    <strong className="text-foreground">{bandDisc}</strong>;
                                    la tariffa risale a velocità{" "}
                                    <strong className="text-foreground">{speed}</strong>
                                    {" "}({band.rate_growth_pct}% per punto di occupazione
                                    guadagnato) fino a un massimo di recupero del{" "}
                                    <strong className="text-foreground">{band.max_recovery_pct}%</strong>.
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>

            {/* Closing tip */}
            <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm text-foreground leading-relaxed">
                <strong>In pratica:</strong> quando un cliente cerca una camera per una
                data vicina, il sistema guarda quante camere hai ancora disponibili per
                quella notte, trova il livello corrispondente e applica lo sconto
                configurato. Se la data si avvicina e l&apos;occupazione sale, il motore
                riduce progressivamente lo sconto per non svendere le ultime camere.
              </p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button onClick={onClose}>Ho capito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
