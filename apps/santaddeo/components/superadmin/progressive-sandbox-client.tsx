"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles } from "lucide-react"
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

interface Hotel {
  id: string
  name: string
}
interface RoomType {
  id: string
  name: string
  quantity?: number | null
  total_rooms?: number | null
  is_active?: boolean
}

interface ApiResponse {
  hotelId: string
  roomType: { id: string; name: string }
  params: { N: number; K: number; PMIN: number; PMAX: number; A: number; PI: number }
  suggestedPI: number
  curve: { X: number; price: number }[]
}

export function ProgressiveSandboxClient({ hotels }: { hotels: Hotel[] }) {
  const [hotelId, setHotelId] = useState<string>("")
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [roomTypeId, setRoomTypeId] = useState<string>("")
  const [loadingRoomTypes, setLoadingRoomTypes] = useState(false)

  const [K, setK] = useState<number>(7)
  const [A, setA] = useState<number>(4)
  const [PI, setPI] = useState<string>("") // empty = derive from K
  const [PMIN, setPMIN] = useState<string>("") // empty = read from rate_limits
  const [PMAX, setPMAX] = useState<string>("")
  const [N, setN] = useState<string>("") // empty = read from room_type

  const [result, setResult] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load room types when hotel changes
  useEffect(() => {
    if (!hotelId) {
      setRoomTypes([])
      setRoomTypeId("")
      return
    }
    setLoadingRoomTypes(true)
    fetch(`/api/settings/room-types?hotelId=${hotelId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: RoomType[] = (d.roomTypes || []).filter(
          (rt: RoomType) => rt && rt.name && rt.is_active !== false,
        )
        setRoomTypes(list)
        if (list.length > 0) setRoomTypeId(list[0].id)
        else setRoomTypeId("")
      })
      .catch(() => setRoomTypes([]))
      .finally(() => setLoadingRoomTypes(false))
  }, [hotelId])

  // Auto-fill N when room type changes
  useEffect(() => {
    if (!roomTypeId) return
    const rt = roomTypes.find((r) => r.id === roomTypeId)
    if (rt) {
      const qty = rt.quantity ?? rt.total_rooms ?? null
      if (qty != null) setN(String(qty))
    }
    // Reset previous result so user understands they need to re-simulate
    setResult(null)
  }, [roomTypeId, roomTypes])

  const canSimulate = !!hotelId && !!roomTypeId

  async function runSimulation() {
    if (!canSimulate) return
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        hotelId,
        roomTypeId,
        K,
        A,
      }
      if (PI.trim() !== "") body.PI = Number(PI)
      if (PMIN.trim() !== "") body.PMIN = Number(PMIN)
      if (PMAX.trim() !== "") body.PMAX = Number(PMAX)
      if (N.trim() !== "") body.N = Number(N)

      const res = await fetch("/api/superadmin/pricing/explain-progressive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setResult(data as ApiResponse)
    } catch (e: any) {
      setError(e?.message || "Errore sconosciuto")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* === LEFT: parameters === */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Parametri</CardTitle>
          <CardDescription>
            Seleziona hotel e tipologia, poi modifica K e A per vedere la curva.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Hotel</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleziona hotel" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Room Type</Label>
            <Select
              value={roomTypeId}
              onValueChange={setRoomTypeId}
              disabled={!hotelId || loadingRoomTypes}
            >
              <SelectTrigger className="mt-1">
                <SelectValue
                  placeholder={
                    loadingRoomTypes ? "Caricamento..." : "Seleziona tipologia"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>
                    {rt.name}
                    {rt.quantity != null
                      ? ` (${rt.quantity} cam.)`
                      : rt.total_rooms != null
                      ? ` (${rt.total_rooms} cam.)`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">
                  K — domanda (0-10)
                </Label>
                <span className="text-sm font-mono font-semibold">{K}</span>
              </div>
              <Slider
                value={[K]}
                onValueChange={(v) => setK(v[0])}
                min={0}
                max={10}
                step={1}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">
                  A — base crescita (2-10)
                </Label>
                <span className="text-sm font-mono font-semibold">{A}</span>
              </div>
              <Slider
                value={[A]}
                onValueChange={(v) => setA(v[0])}
                min={2}
                max={10}
                step={1}
              />
            </div>
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                N (override)
              </Label>
              <Input
                value={N}
                onChange={(e) => setN(e.target.value)}
                placeholder="auto"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                PI (override)
              </Label>
              <Input
                value={PI}
                onChange={(e) => setPI(e.target.value)}
                placeholder="da K"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">PMIN</Label>
              <Input
                value={PMIN}
                onChange={(e) => setPMIN(e.target.value)}
                placeholder="auto"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">PMAX</Label>
              <Input
                value={PMAX}
                onChange={(e) => setPMAX(e.target.value)}
                placeholder="auto"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <Button
            onClick={runSimulation}
            disabled={!canSimulate || loading}
            className="mt-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Simula curva
          </Button>

          {error && (
            <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-2">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === RIGHT: chart + legend + table === */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Legenda parametri</CardTitle>
            <CardDescription>
              Cosa rappresenta ogni valore della curva e come viene usato
              dall&apos;algoritmo Progressive.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-muted-foreground mb-4 leading-relaxed">
              La curva calcola il prezzo della{" "}
              <span className="font-semibold text-foreground">X-esima</span>{" "}
              camera venduta. Quindi <span className="font-mono">X=1</span> e&apos;
              il prezzo della prima camera (quando l&apos;hotel e&apos; vuoto),{" "}
              <span className="font-mono">X=N</span> e&apos; il prezzo
              dell&apos;ultima camera disponibile (quando ne resta solo una).
              All&apos;aumentare di X il prezzo cresce monotonicamente da{" "}
              <span className="font-mono">PI</span> fino a{" "}
              <span className="font-mono">PMAX</span>; il fattore{" "}
              <span className="font-mono">A</span> controlla la{" "}
              <span className="italic">forma</span> della crescita (con A basso
              il prezzo sale presto, con A alto resta basso a lungo e
              s&apos;impenna alla fine).
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="font-mono font-semibold text-foreground">N</dt>
                <dd className="text-muted-foreground">
                  Numero totale di camere della tipologia (es. 7 per Tuscan
                  Style). Definisce su quanti step si distribuisce la curva. Si
                  legge da <span className="font-mono">room_types.total_rooms</span>.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">K</dt>
                <dd className="text-muted-foreground">
                  Indice di domanda, scala 0-10. K=0 = domanda molto bassa
                  (prezzo iniziale = PMIN), K=10 = domanda molto alta (prezzo
                  iniziale = PMAX). Determina il punto di partenza{" "}
                  <span className="font-mono">PI</span> della curva.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">A</dt>
                <dd className="text-muted-foreground">
                  Base di crescita esponenziale (2-10).{" "}
                  <span className="font-semibold">A basso (es. 2)</span> = curva
                  graduale: il prezzo sale in modo regolare e raggiunge valori
                  alti gia&apos; a meta&apos; occupazione.{" "}
                  <span className="font-semibold">A alto (es. 10)</span> = curva
                  piatta: il prezzo resta vicino a PI per quasi tutta la vendita
                  e salta a PMAX solo sull&apos;ultima camera (effetto
                  &quot;hockey-stick&quot;).
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">PMIN</dt>
                <dd className="text-muted-foreground">
                  Prezzo minimo configurato per la tipologia (rate_limits). E&apos;
                  il limite inferiore: nessuna X scende sotto questo valore.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">PMAX</dt>
                <dd className="text-muted-foreground">
                  Prezzo massimo configurato (rate_limits). E&apos; il limite
                  superiore: l&apos;ultima camera (X=N) viene sempre venduta a
                  PMAX.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">PI</dt>
                <dd className="text-muted-foreground">
                  <span className="italic">Prezzo iniziale</span> = prezzo della
                  prima camera (X=1). Se non lo forzi, viene derivato da K
                  interpolando linearmente fra PMIN (K=0) e PMAX (K=10).
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-mono font-semibold text-foreground">
                  PI suggerito da K
                </dt>
                <dd className="text-muted-foreground">
                  Il PI che l&apos;algoritmo userebbe in automatico considerando
                  solo K (senza override). Confronto utile per capire di quanto
                  ti stai discostando dal default quando inserisci un PI manuale.
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-mono font-semibold text-foreground">
                  X (asse del grafico)
                </dt>
                <dd className="text-muted-foreground">
                  Numero della camera in vendita = camere gia&apos; vendute +
                  1. X=1 e&apos; la prima camera quando l&apos;hotel e&apos;
                  vuoto, X=N e&apos; l&apos;ultima quando ne resta una sola.
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-mono font-semibold text-foreground">
                  P(X) (asse Y / colonna &quot;Prezzo&quot;)
                </dt>
                <dd className="text-muted-foreground">
                  Prezzo da pubblicare per la X-esima camera, calcolato come
                  <span className="font-mono ml-1">
                    P(X) = ((PMAX - PI)&middot;A^(X-1) + PI&middot;A^(N-1) -
                    PMAX) / (A^(N-1) - 1)
                  </span>
                  . Cresce monotonicamente da PI (X=1) fino a PMAX (X=N).
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">
                  Delta vs PMIN
                </dt>
                <dd className="text-muted-foreground">
                  Quanti EUR sopra il pavimento PMIN ti trovi a quel livello di
                  X. Utile per capire la &quot;riserva&quot; sopra il minimo.
                </dd>
              </div>
              <div>
                <dt className="font-mono font-semibold text-foreground">
                  % range PMIN-PMAX
                </dt>
                <dd className="text-muted-foreground">
                  Posizione percentuale del prezzo all&apos;interno della banda
                  PMIN-PMAX. 0% = sei a PMIN, 100% = sei a PMAX. Mostra a colpo
                  d&apos;occhio quanto la curva &quot;sta bassa&quot; sui primi
                  step e quanto si concentra l&apos;aumento in fondo.
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Curva prezzi P(X)</CardTitle>
            <CardDescription>
              {result ? (
                <span className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="outline">N={result.params.N}</Badge>
                  <Badge variant="outline">A={result.params.A}</Badge>
                  <Badge variant="outline">K={result.params.K}</Badge>
                  <Badge variant="outline">
                    PMIN={result.params.PMIN.toFixed(0)}
                  </Badge>
                  <Badge variant="outline">
                    PMAX={result.params.PMAX.toFixed(0)}
                  </Badge>
                  <Badge variant="secondary">
                    PI={result.params.PI.toFixed(2)}
                  </Badge>
                  <Badge variant="outline">
                    PI suggerito da K={result.suggestedPI.toFixed(2)}
                  </Badge>
                </span>
              ) : (
                "Simula per vedere la curva"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[360px]">
            {result ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={result.curve}
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="X"
                    label={{
                      value: "Camera in vendita (X)",
                      position: "insideBottom",
                      offset: -4,
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 12,
                    }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                    }}
                    formatter={(v: number) => [`EUR ${v.toFixed(2)}`, "Prezzo"]}
                    labelFormatter={(l) => `X = ${l}`}
                  />
                  <ReferenceLine
                    y={result.params.PMIN}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{
                      value: "PMIN",
                      position: "right",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={result.params.PMAX}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{
                      value: "PMAX",
                      position: "right",
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Seleziona un hotel e una room type, poi premi "Simula curva".
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Tabella prezzi per X</CardTitle>
              <CardDescription>
                X = numero camere gia&apos; vendute + 1 (camera in vendita)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">X</TableHead>
                      <TableHead>Prezzo (EUR)</TableHead>
                      <TableHead>Delta vs PMIN</TableHead>
                      <TableHead>% range PMIN-PMAX</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.curve.map((p) => {
                      const range = result.params.PMAX - result.params.PMIN
                      const pct =
                        range > 0
                          ? ((p.price - result.params.PMIN) / range) * 100
                          : 0
                      return (
                        <TableRow key={p.X}>
                          <TableCell className="font-mono">{p.X}</TableCell>
                          <TableCell className="font-mono font-semibold">
                            {p.price.toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            +{(p.price - result.params.PMIN).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {pct.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
