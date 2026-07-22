"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react"

type AuditRow = {
  id: number
  ts: string
  operation: "INSERT" | "UPDATE" | "DELETE"
  hotel_id: string | null
  param_key: string | null
  date: string | null
  old_value: string | null
  new_value: string | null
  session_user_name: string | null
  application_name: string | null
  client_addr: string | null
  query_text: string | null
  txid: number | null
}

type Hotel = { id: string; name: string }

type Filters = {
  hotelId: string | null
  operation: string | null
  paramKey: string | null
  limit: number
}

const OP_BADGE: Record<string, { label: string; cls: string; icon: typeof Plus }> = {
  INSERT: {
    label: "INSERT",
    cls: "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: Plus,
  },
  UPDATE: {
    label: "UPDATE",
    cls: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: Pencil,
  },
  DELETE: {
    label: "DELETE",
    cls: "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: Trash2,
  },
}

function fmtTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function AuditViewer({
  rows,
  rowsError,
  hotels,
  counts,
  filters,
}: {
  rows: AuditRow[]
  rowsError: string | null
  hotels: Hotel[]
  counts: Record<string, { insert: number; update: number; delete: number }>
  filters: Filters
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const hotelMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const h of hotels) m[h.id] = h.name
    return m
  }, [hotels])

  // Top suspicious activity 24h: hotel con piu' DELETE
  const suspicious = useMemo(() => {
    const list = Object.entries(counts)
      .map(([hid, c]) => ({
        hid,
        name: hotelMap[hid] ?? hid,
        ...c,
        total: c.insert + c.update + c.delete,
      }))
      .filter((x) => x.delete > 0)
      .sort((a, b) => b.delete - a.delete)
    return list.slice(0, 5)
  }, [counts, hotelMap])

  function applyFilter(patch: Record<string, string | null | number>) {
    const sp = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === undefined) sp.delete(k)
      else sp.set(k, String(v))
    }
    router.push(`/superadmin/pricing-params-audit?${sp.toString()}`)
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit pricing_algo_params</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Log forense di INSERT / UPDATE / DELETE sulla tabella
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">
            pricing_algo_params
          </code>
          . Installato dopo l&apos;incident del 30/04/2026 (Barronci, perdita
          di
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">
            rate_adj_*
          </code>
          /
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">
            room_type_adj_*
          </code>
          /
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-foreground text-xs">
            occ_adj_*
          </code>
          dal 1/5 al 31/12). Cattura: operazione, hotel, chiave, vecchio/nuovo
          valore, ruolo DB, application_name, IP client, query troncata, e txid
          per raggruppare batch.
        </p>
      </div>

      {/* SUMMARY 24h: hotel con DELETE recenti = sospetti */}
      {suspicious.length > 0 && (
        <Card className="border-red-200 dark:border-red-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
              Attivita&apos; sospetta nelle ultime 24h
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5 text-sm">
              {suspicious.map((s) => (
                <li
                  key={s.hid}
                  className="flex items-center justify-between gap-2 border-b last:border-b-0 py-1.5"
                >
                  <span className="font-medium">{s.name}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                      {s.insert} INSERT
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      {s.update} UPDATE
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-semibold">
                      {s.delete} DELETE
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => applyFilter({ hotel_id: s.hid, operation: "DELETE" })}
                    >
                      Apri
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* FILTRI */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Hotel
              </label>
              <Select
                value={filters.hotelId ?? "all"}
                onValueChange={(v) => applyFilter({ hotel_id: v === "all" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutti gli hotel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli hotel</SelectItem>
                  {hotels.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Operazione
              </label>
              <Select
                value={filters.operation ?? "all"}
                onValueChange={(v) => applyFilter({ operation: v === "all" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  <SelectItem value="INSERT">INSERT</SelectItem>
                  <SelectItem value="UPDATE">UPDATE</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Param key (prefisso)
              </label>
              <Input
                value={filters.paramKey ?? ""}
                placeholder="es. rate_adj_"
                onChange={(e) => {
                  // debounce light: applica al blur o invio
                }}
                onBlur={(e) =>
                  applyFilter({ param_key: e.target.value.trim() === "" ? null : e.target.value.trim() })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value.trim()
                    applyFilter({ param_key: v === "" ? null : v })
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                Righe
              </label>
              <Select
                value={String(filters.limit)}
                onValueChange={(v) => applyFilter({ limit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TABELLA */}
      {rowsError ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-red-700">Errore caricamento log: {rowsError}</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Nessun evento per questi filtri. Il trigger e&apos; appena stato installato:
              dovresti vedere eventi a partire dalla prima operazione futura sulla tabella.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {rows.length} eventi (ordinati dal piu&apos; recente)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {rows.map((r) => {
                const cfg = OP_BADGE[r.operation]
                const Icon = cfg.icon
                const isOpen = expanded.has(r.id)
                return (
                  <div
                    key={r.id}
                    className="border rounded-md text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.id)}
                      className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted/50 text-left"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${cfg.cls}`}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtTs(r.ts)}
                      </span>
                      <span className="text-xs font-medium truncate max-w-[200px]">
                        {r.hotel_id ? hotelMap[r.hotel_id] ?? r.hotel_id.slice(0, 8) : "—"}
                      </span>
                      <span className="text-xs font-mono truncate max-w-[180px]">
                        {r.param_key ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {r.date ?? "—"}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        {r.application_name && (
                          <Badge variant="outline" className="text-[10px]">
                            {r.application_name}
                          </Badge>
                        )}
                        {r.session_user_name && (
                          <span className="text-[10px] text-muted-foreground">
                            {r.session_user_name}
                          </span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t px-3 py-3 bg-muted/30 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              Old value
                            </div>
                            <code className="block px-2 py-1 rounded bg-background border break-all">
                              {r.old_value ?? "—"}
                            </code>
                          </div>
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              New value
                            </div>
                            <code className="block px-2 py-1 rounded bg-background border break-all">
                              {r.new_value ?? "—"}
                            </code>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              IP
                            </div>
                            <code className="text-foreground">{r.client_addr ?? "—"}</code>
                          </div>
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              Application
                            </div>
                            <code className="text-foreground">{r.application_name ?? "—"}</code>
                          </div>
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              DB role
                            </div>
                            <code className="text-foreground">{r.session_user_name ?? "—"}</code>
                          </div>
                          <div>
                            <div className="text-muted-foreground uppercase font-medium mb-0.5">
                              Txid
                            </div>
                            <code className="text-foreground tabular-nums">
                              {r.txid != null ? r.txid : "—"}
                            </code>
                          </div>
                        </div>
                        {r.query_text && (
                          <div>
                            <div className="text-muted-foreground uppercase font-medium text-xs mb-0.5">
                              Query (troncata a 500 char)
                            </div>
                            <pre className="text-[11px] px-2 py-2 rounded bg-background border overflow-x-auto whitespace-pre-wrap break-all">
                              {r.query_text}
                            </pre>
                            {r.txid != null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-7 text-[11px]"
                                onClick={() =>
                                  applyFilter({
                                    operation: null,
                                    param_key: null,
                                    hotel_id: r.hotel_id,
                                  })
                                }
                              >
                                Vedi tutte le righe di questo hotel
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
