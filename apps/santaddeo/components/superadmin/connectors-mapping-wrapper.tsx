"use client"

import { useState, useCallback, useMemo } from "react"
import { ConnectorsMappingTable } from "@/components/superadmin/connectors-mapping-table"
import { PMSProvidersManager } from "@/components/superadmin/pms-providers-manager"
import { HotelBindingsManager } from "@/components/superadmin/hotel-bindings-manager"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle, Settings, Database, Link2 } from "lucide-react"

const CRITICAL_ENTITIES = [
  "property",
  "room_type",
  "room",
  "reservation",
  "booking_room",
  "rate",
  "day_price",
  "room_availability",
  "customer",
  "tax_document",
]

const CRITICAL_ENTITY_TYPES = ["room_type", "rate_plan", "reservation", "guest", "booking_room", "tax_document"]

interface PmsProvider {
  id: string
  name: string
  code: string
  connection_status: string
  available_entities?: string[]
}

interface Props {
  initialMappings: any[]
  hotels: any[]
  pmsData: any
  rmsCanonicalCodes: any
  pmsProviders: PmsProvider[]
}

export function ConnectorsMappingWrapper({
  initialMappings,
  hotels,
  rmsCanonicalCodes,
  pmsProviders: initialPmsProviders,
  pmsData,
}: Props) {
  const [activeTab, setActiveTab] = useState("providers")
  const [pmsProviders, setPmsProviders] = useState<PmsProvider[]>(initialPmsProviders)
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    () => pmsProviders.find((p) => p.connection_status === "connected")?.id || pmsProviders[0]?.id || "",
  )
  const [mappings, setMappings] = useState<any[]>(initialMappings)
  const [pmsGlobalData, setPmsGlobalData] = useState<Record<string, any[]>>(pmsData?.values || {})
  const [pmsHotelData, setPmsHotelData] = useState<Record<string, any[]>>({})

  const selectedProvider = pmsProviders.find((p) => p.id === selectedProviderId)
  const availableEntities = selectedProvider?.available_entities || []

  const missingCapabilities = CRITICAL_ENTITIES.filter((entity) => !availableEntities.includes(entity))

  // Group rmsCanonicalCodes by entity_type: { entity_type: [code1, code2, ...] }
  const groupedRmsCodes = useMemo(() => {
    if (!rmsCanonicalCodes) return {}
    // If already grouped (Record<string, string[]>), return as-is
    if (!Array.isArray(rmsCanonicalCodes)) return rmsCanonicalCodes as Record<string, string[]>
    // Group array of {entity_type, code, label, ...} into {entity_type: [code, ...]}
    const grouped: Record<string, string[]> = {}
    for (const item of rmsCanonicalCodes) {
      if (!item.entity_type || !item.code) continue
      if (!grouped[item.entity_type]) grouped[item.entity_type] = []
      grouped[item.entity_type].push(item.code)
    }
    return grouped
  }, [rmsCanonicalCodes])

  const missingMappings = useMemo(() => {
    const mappedEntityTypes = [...new Set(mappings.map((m) => m.pms_entity_type || m.entity_type))]
    return CRITICAL_ENTITY_TYPES.filter((type) => !mappedEntityTypes.includes(type))
  }, [mappings])

  const handleProviderUpdate = useCallback((updatedProvider: PmsProvider) => {
    setPmsProviders((prev) => prev.map((p) => (p.id === updatedProvider.id ? updatedProvider : p)))
  }, [])

  const handleMappingsUpdate = useCallback((newMappings: any[]) => {
    setMappings(newMappings)
  }, [])

  const handlePmsGlobalDataUpdate = useCallback((data: Record<string, any[]>) => {
    setPmsGlobalData(data)
  }, [])

  const handlePmsHotelDataUpdate = useCallback((data: Record<string, any[]>) => {
    setPmsHotelData(data)
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-500 text-white">Connesso</Badge>
      case "configured":
        return <Badge className="bg-yellow-500 text-white">Configurato</Badge>
      case "error":
        return <Badge variant="destructive">Errore</Badge>
      default:
        return <Badge variant="secondary">Non configurato</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="h-6 w-6 text-primary" />
              <div>
                <CardTitle className="text-lg">PMS Attivo per Mappatura</CardTitle>
                <CardDescription>Seleziona il PMS per cui vuoi configurare le mappature</CardDescription>
              </div>
            </div>
            {selectedProvider && getStatusBadge(selectedProvider.connection_status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger className="w-[300px] bg-background">
                <SelectValue placeholder="Seleziona un PMS..." />
              </SelectTrigger>
              <SelectContent>
                {pmsProviders.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nessun PMS configurato
                  </SelectItem>
                ) : (
                  pmsProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            provider.connection_status === "connected"
                              ? "bg-green-500"
                              : provider.connection_status === "configured"
                                ? "bg-yellow-500"
                                : provider.connection_status === "error"
                                  ? "bg-red-500"
                                  : "bg-gray-400"
                          }`}
                        />
                        {provider.name} ({provider.code})
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {selectedProvider && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  {missingCapabilities.length === 0 ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Tutte le entità API abilitate</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span>{missingCapabilities.length} entità API da abilitare in Capabilities</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {pmsProviders.length === 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Nessun PMS configurato</p>
                <p className="text-sm text-yellow-700">
                  Vai alla tab "Configurazione PMS" per aggiungere e configurare un PMS.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="providers" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurazione PMS
          </TabsTrigger>
          <TabsTrigger value="mapping" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Mappatura Dati
          </TabsTrigger>
          <TabsTrigger value="bindings" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Binding & Versioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <PMSProvidersManager initialProviders={pmsProviders} onProviderUpdate={handleProviderUpdate} />
        </TabsContent>

        <TabsContent value="mapping">
          <ConnectorsMappingTable
            key={selectedProviderId}
            initialMappings={mappings}
            hotels={hotels}
            pmsData={{ values: pmsGlobalData }}
            pmsHotelData={pmsHotelData}
            rmsCanonicalCodes={groupedRmsCodes}
            pmsProviders={pmsProviders}
            selectedProviderId={selectedProviderId}
            criticalEntities={CRITICAL_ENTITY_TYPES}
            missingCriticalEntities={missingMappings}
            onMappingsUpdate={handleMappingsUpdate}
            onPmsGlobalDataUpdate={handlePmsGlobalDataUpdate}
            onPmsHotelDataUpdate={handlePmsHotelDataUpdate}
          />
        </TabsContent>

        <TabsContent value="bindings">
          <HotelBindingsManager selectedProviderId={selectedProviderId} pmsProviders={pmsProviders} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
