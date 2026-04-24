"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  Clock,
  Globe,
  Loader2,
  MapPin,
  MonitorSmartphone,
  Search,
  User2,
  UserRound,
} from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Session {
  id: string
  session_id: string
  email: string | null
  contact_id: string | null
  anonymous_id: string | null
  first_seen_at: string
  last_seen_at: string
  event_count: number
  landing_page: string | null
  last_page: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  country: string | null
  city: string | null
  device_type: string | null
  browser: string | null
  os: string | null
}

interface TimelineEvent {
  id: string
  event_type: string
  event_category: string | null
  payload: Record<string, unknown>
  page_url: string | null
  referrer: string | null
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function relTime(iso: string): string {
  const d = new Date(iso).getTime()
  const now = Date.now()
  const secs = Math.floor((now - d) / 1000)
  if (secs < 60) return `${secs}s fa`
  if (secs < 3600) return `${Math.floor(secs / 60)}m fa`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h fa`
  return `${Math.floor(secs / 86400)}g fa`
}

export default function VisitorsPage() {
  const [q, setQ] = useState("")
  const [identified, setIdentified] = useState<"all" | "true" | "false">("all")
  const [selected, setSelected] = useState<string | null>(null)

  const listUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set("limit", "75")
    if (q) p.set("q", q)
    if (identified !== "all") p.set("identified", identified)
    return `/api/admin/tracking/sessions?${p.toString()}`
  }, [q, identified])

  const { data, isLoading } = useSWR<{ sessions: Session[] }>(listUrl, fetcher, { refreshInterval: 15000 })
  const sessions = data?.sessions ?? []
  const selectedSession = sessions.find((s) => s.session_id === selected) ?? sessions[0]

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <AdminHeader title="Tracking - Visitatori" subtitle="Sessioni live e timeline eventi" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <Link
            href="/admin/tracking/sites"
            className="text-sm text-[#5c4a3a] hover:text-[#463729] inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Siti tracking
          </Link>
          <div className="flex gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8b7355]" />
              <Input
                placeholder="Cerca email o session id"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            <Select value={identified} onValueChange={(v) => setIdentified(v as typeof identified)}>
              <SelectTrigger className="w-[180px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="true">Identificati</SelectItem>
                <SelectItem value="false">Anonimi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* List */}
          <div className="lg:col-span-2 space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-[#8b7355]">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Caricamento...
              </div>
            ) : sessions.length === 0 ? (
              <Card className="bg-white border-[#e8e0d8]">
                <CardContent className="py-10 text-center text-[#8b7355]">
                  Nessuna sessione ancora. Assicurati di aver installato lo script su un sito attivo.
                </CardContent>
              </Card>
            ) : (
              sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  active={(selected ?? sessions[0]?.session_id) === s.session_id}
                  onClick={() => setSelected(s.session_id)}
                />
              ))
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-3">
            {selectedSession ? (
              <SessionDetail key={selectedSession.session_id} session={selectedSession} />
            ) : (
              <Card className="bg-white border-[#e8e0d8]">
                <CardContent className="py-16 text-center text-[#8b7355]">
                  Seleziona una sessione per vederne la timeline.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SessionRow({ s, active, onClick }: { s: Session; active: boolean; onClick: () => void }) {
  const identified = !!s.email
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border transition-colors p-3 ${
        active
          ? "bg-white border-[#5c4a3a] shadow-sm"
          : "bg-white/70 border-[#e8e0d8] hover:bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
            identified ? "bg-[#5c4a3a] text-white" : "bg-[#e8e0d8] text-[#5c4a3a]"
          }`}
        >
          {identified ? <UserRound className="h-4 w-4" /> : <User2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[#5c4a3a] truncate">
              {s.email ?? `anonimo · ${s.session_id.slice(0, 8)}`}
            </span>
            <Badge variant="outline" className="text-xs">
              {s.event_count} eventi
            </Badge>
          </div>
          <div className="text-xs text-[#8b7355] flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {relTime(s.last_seen_at)}
            </span>
            {s.country && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {s.city ? `${s.city}, ${s.country}` : s.country}
              </span>
            )}
            {s.device_type && (
              <span className="flex items-center gap-1">
                <MonitorSmartphone className="h-3 w-3" /> {s.device_type}
              </span>
            )}
          </div>
          {s.last_page && <div className="text-xs text-[#8b7355] truncate mt-1">{s.last_page}</div>}
        </div>
      </div>
    </button>
  )
}

function SessionDetail({ session }: { session: Session }) {
  const { data, isLoading } = useSWR<{ session: Session; events: TimelineEvent[] }>(
    `/api/admin/tracking/sessions/${encodeURIComponent(session.session_id)}`,
    fetcher,
    { refreshInterval: 10000 },
  )
  const events = data?.events ?? []

  return (
    <Card className="bg-white border-[#e8e0d8]">
      <CardHeader>
        <CardTitle className="text-[#5c4a3a] flex items-center gap-2">
          {session.email ? (
            <>
              <UserRound className="h-5 w-5" /> {session.email}
            </>
          ) : (
            <>
              <User2 className="h-5 w-5" /> Visitatore anonimo
            </>
          )}
        </CardTitle>
        <CardDescription className="text-[#8b7355]">
          Session <code className="text-xs">{session.session_id.slice(0, 12)}...</code> · iniziata{" "}
          {relTime(session.first_seen_at)} · ultimo evento {relTime(session.last_seen_at)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Meta label="Pagine" value={String(session.event_count)} />
          <Meta label="Paese" value={session.city ? `${session.city}, ${session.country ?? ""}` : session.country} />
          <Meta label="Dispositivo" value={session.device_type} />
          <Meta label="Browser" value={`${session.browser ?? "-"} / ${session.os ?? "-"}`} />
          <Meta label="UTM source" value={session.utm_source} />
          <Meta label="UTM medium" value={session.utm_medium} />
          <Meta label="UTM campaign" value={session.utm_campaign} />
          <Meta label="Referrer" value={session.referrer} truncate />
        </div>

        <div>
          <h3 className="text-sm font-medium text-[#5c4a3a] mb-2">Timeline</h3>
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-[#8b7355]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carico eventi...
            </div>
          ) : events.length === 0 ? (
            <div className="py-6 text-sm text-[#8b7355] text-center">Nessun evento ancora.</div>
          ) : (
            <ol className="relative border-l-2 border-[#e8e0d8] ml-2 space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="pl-4 relative">
                  <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full bg-[#5c4a3a]" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-[#5c4a3a] text-white hover:bg-[#463729]">{ev.event_type}</Badge>
                    {ev.event_category && (
                      <Badge variant="outline" className="text-xs">
                        {ev.event_category}
                      </Badge>
                    )}
                    <span className="text-xs text-[#8b7355]">{new Date(ev.created_at).toLocaleString("it-IT")}</span>
                  </div>
                  {ev.page_url && (
                    <div className="text-xs text-[#8b7355] mt-1 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> <span className="truncate">{ev.page_url}</span>
                    </div>
                  )}
                  {Object.keys(ev.payload || {}).length > 0 && (
                    <pre className="text-xs bg-[#f8f7f4] text-[#5c4a3a] rounded p-2 mt-2 overflow-x-auto">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {session.contact_id && (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/admin/crm?contact=${session.contact_id}`}>Apri contatto CRM</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function Meta({ label, value, truncate }: { label: string; value: string | null | undefined; truncate?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[#8b7355]">{label}</div>
      <div className={`text-sm text-[#5c4a3a] ${truncate ? "truncate" : ""}`}>{value || "—"}</div>
    </div>
  )
}
