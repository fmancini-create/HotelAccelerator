"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AlertCircle, CheckCircle2, Info, Lock, Zap, XCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Mapping {
  id: string
  pms_provider: string
  pms_entity_type: string
  pms_code: string
  pms_label: string | null
  rms_code: string
  rms_label: string | null
  hotel_id: string | null
  locked: boolean
}

interface Hotel {
  id: string
  name: string
}

interface ETLStatus {
  can_run: boolean
  mapping_status?: string
  binding_status?: string
  blockers?: Array<{ code: string; message: string }>
}

interface HotelBinding {
  id: string
  status: string
  pms_providers?: { name: string }
  checklist_status?: {
    room_types?: { complete: boolean }
    rate_plans?: { complete: boolean }
    completeness_percentage?: number
  }
}

interface HotelMappingsViewerProps {
  hotel: Hotel
  mappings: Mapping[]
  pmsName: string
  etlStatus?: ETLStatus | null
  hotelBinding?: HotelBinding | null
}

// Etichette per i tipi di entità
const ENTITY_TYPE_LABELS: Record<string, string> = {
  room_type: "Tipologie Camera",
  rate_plan: "Piani Tariffari",
  channel: "Canali di Vendita",
  payment_method: "Metodi di Pagamento",
  meal_plan: "Trattamenti Pasti",
  booking_status: "Stati Prenotazione",
  document_type: "Tipi Documento",
}

// Etichette RMS
const RMS_LABELS: Record<string, Record<string, string>> = {
  booking_status: {
    CONFIRMED: "Confermata",
    CANCELLED: "Cancellata",
    PENDING: "In Attesa",
    NO_SHOW: "No Show",
    CHECKED_IN: "Check-in Effettuato",
    CHECKED_OUT: "Check-out Effettuato",
  },
  document_type: {
    INVOICE: "Fattura",
    RECEIPT: "Ricevuta",
    CREDIT_NOTE: "Nota di Credito",
    PROFORMA: "Proforma",
    DEPOSIT: "Caparra",
  },
  payment_method: {
    CASH: "Contanti",
    CREDIT_CARD: "Carta di Credito",
    BANK_TRANSFER: "Bonifico",
    PAYPAL: "PayPal",
    OTHER: "Altro",
  },
  meal_plan: {
    RO: "Solo Pernottamento",
    BB: "Bed & Breakfast",
    HB: "Mezza Pensione",
    FB: "Pensione Completa",
    AI: "All Inclusive",
  },
}

export function HotelMappingsViewer({ hotel, mappings, pmsName, etlStatus, hotelBinding }: HotelMappingsViewerProps) {
  // Raggruppa mappature per tipo
  const mappingsByType = mappings.reduce(
    (acc, m) => {
      if (!acc[m.pms_entity_type]) {
        acc[m.pms_entity_type] = []
      }
      acc[m.pms_entity_type].push(m)
      return acc
    },
    {} as Record<string, Mapping[]>,
  )

  // Tipi per struttura (visibili all'admin)
  const hotelEntityTypes = ["room_type", "rate_plan", "channel", "payment_method", "meal_plan"]

  // Filtra solo i tipi rilevanti per la struttura
  const relevantTypes = hotelEntityTypes.filter((type) => mappingsByType[type] && mappingsByType[type].length > 0)

  const getRmsLabel = (type: string, code: string) => {
    return RMS_LABELS[type]?.[code] || code
  }

  if (relevantTypes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            Mappature PMS → RMS
          </CardTitle>
          <CardDescription>Visualizzazione delle mappature configurate per {hotel.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Nessuna mappatura configurata</AlertTitle>
            <AlertDescription>
              Le mappature per la tua struttura non sono ancora state configurate dal SuperAdmin di piattaforma.
              Contatta l'assistenza per richiedere la configurazione.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ETL Status Card */}
      <Card className={etlStatus?.can_run ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {etlStatus?.can_run ? (
              <>
                <Zap className="h-5 w-5 text-green-600" />
                <span className="text-green-800">Sincronizzazione Attiva</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-amber-600" />
                <span className="text-amber-800">Sincronizzazione Non Attiva</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {etlStatus?.can_run ? (
            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Mappatura PMS</span>
                <span className="font-semibold text-green-700">{etlStatus.mapping_status || "OK"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Binding Hotel</span>
                <span className="font-semibold text-green-700">{etlStatus.binding_status || "OK"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Stato</span>
                <Badge className="w-fit bg-green-600">ETL Abilitato</Badge>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-amber-700">
              {etlStatus?.blockers?.map((blocker, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {blocker.message || blocker.code}
                </div>
              ))}
              {!etlStatus?.blockers?.length && (
                <p>La configurazione non è completa. Contatta l'assistenza per abilitare la sincronizzazione.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Binding Status Card */}
      {hotelBinding && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Stato Configurazione</CardTitle>
            <CardDescription>Dettaglio della configurazione per {hotel.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4 text-sm">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Provider PMS</span>
                <span className="font-semibold">{hotelBinding.pms_providers?.name || pmsName}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Stato Binding</span>
                <Badge
                  variant={hotelBinding.status === "ACTIVE" ? "default" : "outline"}
                  className={hotelBinding.status === "ACTIVE" ? "w-fit bg-green-600" : "w-fit"}
                >
                  {hotelBinding.status}
                </Badge>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Camere Mappate</span>
                <span className="font-semibold">
                  {hotelBinding.checklist_status?.room_types?.complete ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Complete
                    </span>
                  ) : (
                    <span className="text-amber-600">Incomplete</span>
                  )}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Tariffe Mappate</span>
                <span className="font-semibold">
                  {hotelBinding.checklist_status?.rate_plans?.complete ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> Complete
                    </span>
                  ) : (
                    <span className="text-amber-600">Incomplete</span>
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                Mappature PMS → RMS
              </CardTitle>
              <CardDescription>Visualizzazione delle mappature configurate per {hotel.name}</CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              PMS: {pmsName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Modalità sola lettura</AlertTitle>
            <AlertDescription>
              Le mappature sono gestite centralmente dal SuperAdmin di piattaforma. Per richiedere modifiche, contatta
              l'assistenza.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue={relevantTypes[0]} className="space-y-4">
            <TabsList className="flex flex-wrap gap-1">
              {relevantTypes.map((type) => (
                <TabsTrigger key={type} value={type} className="text-sm">
                  {ENTITY_TYPE_LABELS[type] || type}
                  <Badge variant="secondary" className="ml-2">
                    {mappingsByType[type]?.length || 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {relevantTypes.map((type) => (
              <TabsContent key={type} value={type}>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{ENTITY_TYPE_LABELS[type] || type}</CardTitle>
                    <CardDescription>
                      Mappatura dei codici {pmsName} verso i codici standard RMS Santaddeo
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">Codice PMS ({pmsName})</TableHead>
                          <TableHead className="w-[40%]">Codice RMS (Santaddeo)</TableHead>
                          <TableHead className="w-[20%]">Stato</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappingsByType[type]?.map((mapping) => (
                          <TableRow key={mapping.id}>
                            <TableCell>
                              <div>
                                <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{mapping.pms_code}</span>
                                {mapping.pms_label && (
                                  <span className="ml-2 text-muted-foreground text-sm">({mapping.pms_label})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-mono text-sm bg-primary/10 text-primary px-2 py-1 rounded">
                                  {mapping.rms_code}
                                </span>
                                <span className="ml-2 text-muted-foreground text-sm">
                                  ({mapping.rms_label || getRmsLabel(type, mapping.rms_code)})
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {mapping.locked ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Lock className="h-3 w-3" />
                                    Bloccato
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Attivo
                                  </Badge>
                                )}
                                {!mapping.hotel_id && (
                                  <Badge variant="outline" className="text-xs">
                                    Globale
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Sezione stati prenotazione e documenti (globali, read-only) */}
      {(mappingsByType["booking_status"]?.length > 0 || mappingsByType["document_type"]?.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mappature Globali di Sistema</CardTitle>
            <CardDescription>
              Queste mappature sono valide per tutte le strutture e non possono essere modificate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mappingsByType["booking_status"]?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Stati Prenotazione</h4>
                <div className="flex flex-wrap gap-2">
                  {mappingsByType["booking_status"].map((m) => (
                    <Badge key={m.id} variant="outline" className="font-mono text-xs">
                      {m.pms_code} → {m.rms_code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {mappingsByType["document_type"]?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Tipi Documento</h4>
                <div className="flex flex-wrap gap-2">
                  {mappingsByType["document_type"].map((m) => (
                    <Badge key={m.id} variant="outline" className="font-mono text-xs">
                      {m.pms_code} → {m.rms_code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
