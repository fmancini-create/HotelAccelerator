"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ArrowUp, ArrowDown, Minus, BedDouble, Loader2 } from "lucide-react"

interface PriceChange {
  id: string
  old_price: number | null
  new_price: number
  changed_at: string
  source: string
  action_taken?: string | null
  changed_by?: string | null
  user_name?: string | null
}

interface SparklinePoint {
  date: string
  price: number
}

interface PriceHistoryData {
  enrichedHistory: PriceChange[]
  priceEvolutionSeries: { timestamp: string; price: number }[]
  startingPrice: number | null
  currentPrice: number | null
  lastSentPrice: number | null
  lastSentAt: string | null
  currentRoomsSold: number | null
  totalRooms: number | null
  lastUpdated: string | null
}

// Mini sparkline drawn with SVG
function MiniSparkline({ data, width = 290, height = 44, labels }: { data: { label: string; value: number }[]; width?: number; height?: number; labels?: boolean }) {
  if (data.length === 0) return null
  
  // Se c'è un solo punto, disegnalo al centro come un dot singolo
  if (data.length === 1) {
    const val = data[0].value
    const centerX = width / 2
    const centerY = height / 2
    return (
      <svg width={width} height={height} className="block">
        <circle cx={centerX} cy={centerY} r="3" fill="#6b7280" />
        <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="8" fill="#9ca3af">{val.toFixed(0)}</text>
      </svg>
    )
  }

  // Altrimenti disegna la linea come prima
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const padding = 2

  const points = values.map((val, i) => {
    const x = padding + (i / (values.length - 1)) * (width - 2 * padding)
    const y = height - padding - ((val - min) / range) * (height - 2 * padding)
    return { x, y }
  })

  const trend = values[values.length - 1] - values[0]
  const color = trend > 0 ? "#16a34a" : trend < 0 ? "#dc2626" : "#6b7280"

  const fillPoints = [
    `${padding},${height - padding}`,
    ...points.map(p => `${p.x},${p.y}`),
    `${width - padding},${height - padding}`,
  ].join(" ")

  return (
    <svg width={width} height={height} className="block">
      <polygon
        points={fillPoints}
        fill={trend > 0 ? "rgba(22,163,74,0.1)" : trend < 0 ? "rgba(220,38,38,0.1)" : "rgba(107,114,128,0.08)"}
      />
      <polyline
        points={points.map(p => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots at start and end */}
      <circle cx={points[0].x} cy={points[0].y} r="2.5" fill={color} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} />
      {/* Min/max labels */}
      <text x={width - padding} y={padding + 8} textAnchor="end" fontSize="8" fill="#9ca3af">{max}</text>
      <text x={width - padding} y={height - padding - 2} textAnchor="end" fontSize="8" fill="#9ca3af">{min}</text>
    </svg>
  )
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
}

function formatDateShort(iso: string) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })
}

  interface Props {
  hotelId: string
  roomTypeId: string
  rateId: string
  occupancy: number
  targetDate: string
  displayPrice?: number | null // Optional: pass the calculated/displayed price from parent
  autopilotMode?: "autopilot" | "notify" | "disabled"
  /**
   * Stato Last Minute per la cella, se attivo. Quando passato, il
   * tooltip mostra in cima un banner rosso "Last-minute attivo - Livello
   * · -X%" identico a quello del simulatore prezzi (UX coerente tra
   * Simulatore e Griglia).
   */
  lastMinute?: {
    active: boolean
    levelName?: string
    discountLabel?: string
  }
  children: React.ReactNode
  }

  export function PriceHistoryTooltip({ hotelId, roomTypeId, rateId, occupancy, targetDate, displayPrice, autopilotMode, lastMinute, children }: Props) {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PriceHistoryData | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hasAttemptedFetchRef = useRef(false)

  const fetchData = useCallback(async () => {
    // Prevent duplicate fetches using ref flag (not state)
    if (hasAttemptedFetchRef.current) return
    hasAttemptedFetchRef.current = true

    setLoading(true)
    try {
      const params = new URLSearchParams({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        rate_id: rateId,
        occupancy: String(occupancy),
        target_date: targetDate,
      })
      const url = `/api/accelerator/price-history?${params}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      } else {
        setData(null)
      }
    } catch (e) {
      console.error("[v0] PriceHistoryTooltip fetch failed:", e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [hotelId, roomTypeId, rateId, occupancy, targetDate])

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
      setPosition({ x: e.clientX, y: e.clientY })
      // Reset fetch flag every time tooltip is opened to get fresh data
      hasAttemptedFetchRef.current = false
      fetchData()
    }, 400)
  }, [fetchData])

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(false), 150)
  }, [])

  // Reset fetch flag when cell parameters change
  useEffect(() => {
    hasAttemptedFetchRef.current = false
    setData(null)
    setVisible(false)
  }, [hotelId, roomTypeId, rateId, occupancy, targetDate])

  const handleTooltipEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const handleTooltipLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150)
  }, [])

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  const getTooltipStyle = (): React.CSSProperties => {
    const tooltipWidth = 320
    const tooltipHeight = 300
    let x = position.x + 12
    let y = position.y - 20
    if (typeof window !== "undefined") {
      if (x + tooltipWidth > window.innerWidth - 16) x = position.x - tooltipWidth - 12
      if (y + tooltipHeight > window.innerHeight - 16) y = window.innerHeight - tooltipHeight - 16
      if (y < 16) y = 16
    }
    return { position: "fixed", left: x, top: y, zIndex: 9999 }
  }

  const priceHistory = data?.enrichedHistory || []
  const priceEvolutionSeries = data?.priceEvolutionSeries || []
  const startingPrice = data?.startingPrice
  const currentPrice = data?.currentPrice
  const hasHistory = priceHistory.length > 0
  const hasEvolutionSeries = priceEvolutionSeries.length >= 1

  const sparkData = priceEvolutionSeries.map((s) => ({ 
    label: new Date(s.timestamp).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), 
    value: s.price 
  }))

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="contents"
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          style={getTooltipStyle()}
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          className="bg-popover border border-border rounded-lg shadow-xl p-3 w-[320px] max-h-[360px] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/30">
            <div>
              <span className="text-xs font-bold text-foreground">
                Storico Prezzi - {formatDateShort(targetDate)}
              </span>
              {data?.lastUpdated && (
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Ultimo aggiornamento: {formatDateTime(data.lastUpdated)}
                </div>
              )}
              {!data?.lastUpdated && data && (
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Nessun aggiornamento registrato
                </div>
              )}
            </div>
            {data && data.currentRoomsSold != null && data.totalRooms != null && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <BedDouble className="h-3 w-3" />
                {data.currentRoomsSold}/{data.totalRooms} vendute
              </span>
            )}
          </div>

          {/* Last-minute banner: visibile sempre quando lo stato LM e'
              attivo per la data, indipendentemente dal loading dello
              storico. Stesso linguaggio visivo del simulatore prezzi:
              pallino rosso + label "Last-minute attivo" + livello + sconto. */}
          {lastMinute?.active && (
            <div className="mb-2 flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900/50">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="font-semibold">Last-minute attivo</span>
              {lastMinute.levelName && (
                <span className="text-red-600/90 dark:text-red-300/90">
                  &middot; {lastMinute.levelName}
                </span>
              )}
              {lastMinute.discountLabel && (
                <span className="text-red-600/90 dark:text-red-300/90">
                  &middot; -{lastMinute.discountLabel}
                </span>
              )}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && (
            <>
              {/* Sparkline: Price evolution FOR THIS CELL */}
              {hasEvolutionSeries && (
                <div className="mb-2 bg-muted/30 rounded p-1.5">
                  <div className="text-[9px] text-muted-foreground mb-0.5 font-medium">
                    Evoluzione prezzo per questa cella ({priceEvolutionSeries.length} punti)
                  </div>
                  <MiniSparkline data={sparkData} width={290} height={44} />
                  <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted-foreground">
                    <div className="flex flex-col">
                      <span>Partenza: <span className="font-semibold text-foreground">{startingPrice?.toFixed(0) || "?"}</span></span>
                      {priceHistory.length > 0 && priceHistory[0]?.changed_at && (
                        <span className="text-[8px]">({formatDateShort(priceHistory[0].changed_at.split('T')[0])})</span>
                      )}
                    </div>
                    <div className="flex flex-col text-right">
                      <span>Attuale: <span className="font-semibold text-foreground">{(displayPrice ?? data?.currentPrice)?.toFixed(0) || "?"}</span></span>
                      {data?.lastUpdated && (
                        <span className="text-[8px]">({formatDateTime(data.lastUpdated)})</span>
                      )}
                    </div>
                    {(() => {
                      const currentPriceValue = displayPrice ?? data?.currentPrice
                      if (startingPrice == null || currentPriceValue == null) return null
                      const diff = currentPriceValue - startingPrice
                      const pct = startingPrice > 0 ? ((diff / startingPrice) * 100).toFixed(1) : "0"
                      return (
                        <span className={`font-bold ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(0)} ({diff > 0 ? "+" : ""}{pct}%)
                        </span>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Change log table */}
              {hasHistory ? (
                <>
                  <div className="text-[9px] text-muted-foreground font-medium mb-1">
                    {priceHistory.length} variazione{priceHistory.length !== 1 ? "i" : ""} registrata{priceHistory.length !== 1 ? "e" : ""}
                  </div>
                  <div className="max-h-[160px] overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="sticky top-0 bg-popover">
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left py-0.5 font-medium">Quando</th>
                          <th className="text-right py-0.5 font-medium">Vecchio</th>
                          <th className="text-right py-0.5 font-medium">Nuovo</th>
                          <th className="text-right py-0.5 font-medium">Var.</th>
                          <th className="text-left py-0.5 font-medium pl-1">Fonte</th>
                          <th className="text-left py-0.5 font-medium pl-1">Azione</th>
                          <th className="text-left py-0.5 font-medium pl-1">Chi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/*
                          FIX 30/04/2026: ordine invertito su richiesta utente.
                          La tabella scrollabile mostra ora le variazioni dal piu' recente
                          al piu' vecchio (newest first). La riga "In cella ora" - che
                          rappresenta lo stato corrente, anche piu' recente di qualsiasi
                          entry storicizzata - va naturalmente in cima.
                          Nota: l'array `priceHistory` ORIGINALE resta in ordine cronologico
                          oldest->newest perche' usato altrove nel componente:
                            - `priceHistory[0]` = "Partenza" (oldest) nel sparkline
                            - `priceHistory[length-1]` = ultima entry storicizzata
                          Quindi reverse() solo per il render della tabella.
                        */}

                        {/* Current cell price - row PIU' RECENTE (in cima) */}
                        {displayPrice != null && (() => {
                          const lastSaved = priceHistory.length > 0 ? Number(priceHistory[priceHistory.length - 1].new_price) : null
                          const lastEntry = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null
                          const wasSentToPms = lastEntry?.action_taken === "pms"
                          const pmsTimestamp = wasSentToPms && lastEntry?.changed_at
                            ? new Date(lastEntry.changed_at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                            : null
                          // FIX 07/06/2026 (badge "In attesa di invio auto" bloccato): lo stato di
                          // invio va confrontato con la SORGENTE DI VERITA' realmente pushata al PMS,
                          // cioe' il prezzo persistito in pricing_grid (`data.currentPrice`), NON con
                          // `displayPrice`. `displayPrice` puo' includere l'overlay Last-minute calcolato
                          // a video (es. 122 = 124 -15%): essendo un valore visuale che diverge dal
                          // prezzo persistito/inviato, il confronto displayPrice!=lastSaved era SEMPRE
                          // vero -> badge eternamente "In attesa". Il server applica gia' il LM in fase
                          // di calcolo, quindi currentPrice e' il valore effettivamente inviato.
                          const pushedPrice = data?.currentPrice ?? displayPrice
                          // FIX 07/07/2026 (falso "Da pubblicare"): lo stato di invio va confrontato con
                          // il prezzo REALMENTE sul PMS (last_sent_prices), non con l'action_taken
                          // dell'ULTIMA riga di log. Prima, se l'ultima variazione era un semplice
                          // ricalcolo (action='none') che riproduceva lo stesso prezzo gia' pushato,
                          // il badge cadeva nel ramo else -> "Da pubblicare" pur essendo allineato a
                          // Scidoo. Ora: se griglia == ultimo prezzo inviato al PMS -> "Inviato".
                          const sentPrice = data?.lastSentPrice ?? null
                          // FIX 21/07/2026 (orario "Inviato" non veritiero): prima, con Last-minute
                          // attivo, `lmVisualOnly` forzava alignedWithPms=true SEMPRE, cosi' il badge
                          // stampava "Inviato {lastSentAt}" anche quando il prezzo realmente sul PMS
                          // (lastSentPrice) NON era quello in cella. Caso reale (Barronci Tuscan Style
                          // 22/07): la cella mostrava 188 (appena spinto alle 18:30, ma last_sent_prices
                          // aggiornato solo alle 18:32) mentre il PMS aveva ancora i 193 inviati alle
                          // 11:15 -> il badge mostrava "Inviato 11:15", orario che apparteneva a un
                          // PREZZO DIVERSO (193), non ai 188 visualizzati. La pagina prezzi deve dire
                          // il vero: mostriamo "Inviato {lastSentAt}" SOLO quando il prezzo sul PMS
                          // coincide davvero con la cella. Confrontiamo lastSentPrice sia col prezzo
                          // base persistito (pushedPrice) sia col prezzo visualizzato con LM
                          // (displayPrice): se combacia con uno dei due il PMS ha realmente quel prezzo
                          // e lastSentAt e' il suo vero orario di invio (le due colonne vengono dalla
                          // stessa riga last_sent_prices, quindi sono sempre coerenti tra loro). Se non
                          // combacia con nessuno, il prezzo in cella non e' ancora confermato sul PMS
                          // -> stato pendente, niente orario fuorviante.
                          const matchesBase = sentPrice != null && Math.abs(pushedPrice - sentPrice) < 1
                          const matchesVisual = sentPrice != null && Math.abs(displayPrice - sentPrice) < 1
                          const alignedWithPms = matchesBase || matchesVisual
                          const sentAtLabel = data?.lastSentAt
                            ? new Date(data.lastSentAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                            : pmsTimestamp || ""
                          // Determine label for last column
                          let statusLabel: string
                          let statusColor: string
                          if (alignedWithPms) {
                            // Il PMS ha gia' questo prezzo: allineato, in qualsiasi modalita'.
                            statusLabel = `Inviato ${sentAtLabel}`.trim()
                            statusColor = "text-green-700"
                          } else if (autopilotMode === "autopilot") {
                            statusLabel = "In attesa di invio auto"
                            statusColor = "text-amber-600"
                          } else {
                            statusLabel = "Da pubblicare"
                            statusColor = "text-primary"
                          }
                          return (
                          <tr className="bg-primary/10 border-b-2 border-primary/30">
                            <td className="py-1 font-semibold text-primary text-[9px]">In cella ora</td>
                            <td className="py-1 text-right text-muted-foreground">
                              {lastSaved != null ? lastSaved.toFixed(0) : "--"}
                            </td>
                            <td className="py-1 text-right font-bold text-primary">{displayPrice.toFixed(0)}</td>
                            <td className="py-1 text-right">
                              {(() => {
                                if (lastSaved == null) return <span className="text-muted-foreground/50">--</span>
                                const diff = displayPrice - lastSaved
                                if (Math.abs(diff) < 1) return <Minus className="h-2.5 w-2.5 text-muted-foreground inline" />
                                return (
                                  <span className={`inline-flex items-center gap-0.5 font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                                    {diff > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                                    {Math.abs(diff).toFixed(0)}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className={`py-1 text-left pl-1 text-[9px] font-semibold ${statusColor}`} colSpan={3}>{statusLabel}</td>
                          </tr>
                          )
                        })()}

                        {/* Variazioni storicizzate, dalla piu' recente alla piu' vecchia */}
                        {[...priceHistory].reverse().map((entry, idx) => {
                          const oldP = entry.old_price != null ? Number(entry.old_price) : null
                          const newP = Number(entry.new_price)
                          const diff = oldP != null ? newP - oldP : null

                          return (
                            <tr key={entry.id || idx} className="border-b border-border/50 hover:bg-accent/30">
                              <td className="py-0.5 text-muted-foreground">{formatDateTime(entry.changed_at)}</td>
                              <td className="py-0.5 text-right text-muted-foreground">
                                {oldP != null ? oldP.toFixed(0) : "--"}
                              </td>
                              <td className="py-0.5 text-right font-semibold text-foreground">{newP.toFixed(0)}</td>
                              <td className="py-0.5 text-right">
                                {diff != null && diff !== 0 ? (
                                  <span className={`inline-flex items-center gap-0.5 font-medium ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                                    {diff > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                                    {Math.abs(diff).toFixed(0)}
                                  </span>
                                ) : diff === 0 ? (
                                  <Minus className="h-2.5 w-2.5 text-muted-foreground inline" />
                                ) : (
                                  <span className="text-muted-foreground/50">--</span>
                                )}
                              </td>
                              <td className="py-0.5 text-left pl-1 text-muted-foreground text-[9px]">
                                {entry.source === "manual_grid" ? "Griglia" : entry.source === "autopilot" ? "Autopilot" : entry.source === "initial" ? "Primo prezzo" : entry.source?.replace(/_/g, " ") || "--"}
                              </td>
                              <td className="py-0.5 text-left pl-1 text-muted-foreground text-[9px]">
                                {entry.action_taken === "email"
                                  ? "📧 Email"
                                  : entry.action_taken === "pms"
                                    ? "📤 PMS"
                                    : entry.action_taken === "disabled"
                                      ? "⏸ Solo storage"
                                      : entry.action_taken === "none"
                                        ? "⊘ Niente"
                                        : "—"}
                              </td>
                              <td className="py-0.5 text-left pl-1 text-muted-foreground text-[9px] truncate" title={entry.user_name || entry.changed_by || "Sistema"}>
                                {entry.user_name || entry.changed_by || "Sistema"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : !hasEvolutionSeries ? (
                <div className="text-center text-muted-foreground text-[11px] py-4">
                  {(displayPrice ?? data?.currentPrice) != null ? (
                    <>
                      <div className="text-foreground text-lg font-bold mb-1">{(displayPrice ?? data?.currentPrice)?.toFixed(0)} &euro;</div>
                      <div className="text-[9px]">{autopilotMode === "autopilot" ? "Prezzo in cella (invio automatico)" : "Prezzo in cella (da pubblicare)"}</div>
                      {data?.startingPrice != null && data.startingPrice !== (displayPrice ?? data?.currentPrice) && (
                        <div className="text-[9px] mt-0.5">
                          Partenza: <span className={(displayPrice ?? data?.currentPrice ?? 0) > data.startingPrice ? "text-green-600" : "text-red-600"}>{data.startingPrice.toFixed(0)} &euro;</span>
                        </div>
                      )}
                      {data?.lastUpdated && (
                        <div className="text-[9px] mt-0.5">Aggiornato: {formatDateTime(data.lastUpdated)}</div>
                      )}
                      <div className="text-[9px] mt-1 italic">Le variazioni verranno tracciate ad ogni modifica.</div>
                    </>
                  ) : (
                    <>
                      <div className="text-foreground text-sm font-semibold">Nessun prezzo impostato</div>
                      <div className="text-[9px] mt-1">Inserisci un prezzo nella cella per iniziare il tracciamento.</div>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-[9px] text-muted-foreground italic text-center py-2">
                  Nessuna variazione registrata per questa data.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
