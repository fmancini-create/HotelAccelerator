import { redirect } from "next/navigation"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { PMSConfigForm } from "@/components/settings/pms-config-form"
import { PMSSetupForm } from "@/components/settings/pms-setup-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RoomTypesManager } from "@/components/settings/room-types-manager"
import { RatesManager } from "@/components/settings/rates-manager"
import { ScidooSyncPanel } from "@/components/settings/scidoo-sync-panel"
import { BrigSyncPanel } from "@/components/settings/brig-sync-panel"
import { SlopeSyncPanel } from "@/components/settings/slope-sync-panel"
import { PublishRatesPanel } from "@/components/settings/publish-rates-panel"
import { GSheetsSyncPanel } from "@/components/settings/gsheets-sync-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Settings2, CheckCircle2, XCircle, Info, FileSpreadsheet, Wifi } from "lucide-react"

export const dynamic = "force-dynamic"

// Human-readable PMS labels
const PMS_LABELS: Record<string, string> = {
  scidoo: "Scidoo",
  ericsoft_suite_4: "Ericsoft Suite 4",
  bedzzle: "Bedzzle",
  hotel_cinquestelle: "Hotel Cinquestelle",
  room_cloud: "RoomCloud",
  clock_software: "Clock Software",
  wubook: "Wubook",
  hotelappz: "HotelAppz",
  slope: "Slope",
  hoteltime: "HotelTime",
  roomkeys: "RoomKeys",
  passepartout_welcome: "Passepartout Welcome",
  hotel_2000: "Hotel 2000",
  fidelio_suite8: "Fidelio Suite 8",
  hotel_2000_evolution: "Hotel 2000 Evolution",
  hotelcube_smart: "HotelCube Smart",
  leonardo: "Leonardo",
  nuconga: "Nuconga",
  cloud_hotel: "Cloud Hotel",
  ericsoft_suite_3: "Ericsoft Hotel Suite 3",
}

export default async function PMSSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  const isSuperAdmin = data.isSuperAdmin
  const isDev = await isDevAuthAsync()
  // In dev, use service role to bypass RLS (no real Supabase session)
  const supabase = isDev ? await createServiceRoleClient() : await createClient()
  const selectedHotel = data.selectedHotel

  if (!selectedHotel) {
    redirect(isSuperAdmin ? "/superadmin" : "/onboarding")
  }

  // Load PMS integration for this hotel (any PMS, not just scidoo)
  const adminClient = isDev ? supabase : await createClient()
  const { data: pmsIntegration } = await adminClient
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", selectedHotel.id)
    .maybeSingle()

  // Load available PMS providers for the setup form (always use service role to bypass RLS)
  const { data: pmsProviders } = await adminClient
    .from("pms_providers")
    .select("id, name, code, description, website")
    .order("name")

  const pmsName = pmsIntegration?.pms_name || null
  const pmsLabel = pmsName ? (PMS_LABELS[pmsName] || pmsName) : null
  const integrationMode = pmsIntegration?.integration_mode || "api"
  const isGSheetsMode = integrationMode === "gsheets"

  // Ensure vat_number has a fallback from organization if missing on pms_integrations
  const pmsConfigForForm = pmsIntegration ? {
    ...pmsIntegration,
    vat_number: pmsIntegration.vat_number || data.organization?.vat_number || null,
  } : null

  // Only load room types / rates / ETL if PMS is configured and active
  let roomTypes: any[] = []
  let etlCheck: any = null
  let hasMappings = false

  if (pmsIntegration?.is_active) {
    const { data: rt } = await supabase
      .from("room_types")
      .select("*")
      .eq("hotel_id", selectedHotel.id)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
    roomTypes = rt || []

    if (isGSheetsMode) {
      // GSheets mode: mappature sono nel campo config->gsheets_mapping
      const gsheetsMapping = pmsIntegration.config?.gsheets_mapping
      const columnMap = gsheetsMapping?.prenotazioni?.columnMap
      const hasGSheetsMapping = columnMap && typeof columnMap === 'object' && 
        Object.keys(columnMap).length > 0
      hasMappings = hasGSheetsMapping
      etlCheck = hasGSheetsMapping 
        ? { can_run: true, mapping_status: "GSheets mapping configurato", binding_status: "Google Sheets" }
        : { can_run: false, blockers: [{ message: "Mapping GSheets non configurato. Configurare in Connectors Mapping." }] }
    } else {
      // API mode: usa la funzione can_run_etl e pms_rms_mappings
      const { data: ec } = await supabase
        .rpc("can_run_etl", { p_hotel_id: selectedHotel.id })
        .single()
      etlCheck = ec

      const { data: mappingsData } = await supabase
        .from("pms_rms_mappings")
        .select("id")
        .eq("hotel_id", selectedHotel.id)
        .in("pms_entity_type", ["room_type", "rate_plan"])
        .limit(1)

      hasMappings = etlCheck?.can_run === true || (mappingsData != null && mappingsData.length > 0)
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- NO PMS CONFIGURED: show setup form ---- */}
      {!pmsIntegration && (
        <PMSSetupForm
          hotelId={selectedHotel.id}
          pmsProviders={pmsProviders || []}
        />
      )}

      {/* ---- PMS CONFIGURED ---- */}
      {pmsIntegration && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {pmsLabel}
                    {isGSheetsMode ? (
                      <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700">
                        <FileSpreadsheet className="h-3 w-3" />
                        Google Sheets
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-blue-300 bg-blue-50 text-blue-700">
                        <Wifi className="h-3 w-3" />
                        API
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    {isGSheetsMode ? (
                      <>Dati importati da Google Sheets. Il foglio viene letto periodicamente per sincronizzare disponibilita, tariffe e prenotazioni.</>
                    ) : (
                      <>Credenziali API per la sincronizzazione automatica delle prenotazioni.</>

                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PMSConfigForm
                hotelId={selectedHotel.id}
                pmsName={pmsName!}
                existingConfig={pmsConfigForForm}
              />
            </CardContent>
          </Card>

          {pmsIntegration.is_active && (
            <>
              {/* ETL Status Card */}
              <Card className={etlCheck?.can_run ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {etlCheck?.can_run ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-green-800">ETL Abilitato</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-amber-600" />
                        <span className="text-amber-800">ETL Non Attivo</span>
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {etlCheck?.can_run ? (
                    <div className="text-green-700">
                      <p>Mappatura: <strong>{etlCheck.mapping_status}</strong></p>
                      <p>Binding: <strong>{etlCheck.binding_status}</strong></p>
                      <p className="mt-2">
                        La sincronizzazione automatica e attiva per questa struttura
                        {isGSheetsMode && " (modalita Google Sheets)"}.
                      </p>
                    </div>
                  ) : (
                    <div className="text-amber-700">
                      {etlCheck?.blockers?.map((blocker: any, i: number) => (
                        <p key={i}>{blocker.message || blocker.code}</p>
                      ))}
                      {!etlCheck?.blockers?.length && (
                        <p>Configura le mappature e il binding per abilitare la sincronizzazione.</p>
                      )}
                      {isSuperAdmin && (
                        <a
                          href="/superadmin/connectors-mapping"
                          className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                        >
                          <Settings2 className="h-4 w-4" />
                          Configura in Connectors Mapping
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {!hasMappings ? (
                <Alert variant="default" className="border-amber-500 bg-amber-50">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <AlertTitle className="text-amber-800">Mappature non configurate</AlertTitle>
                  <AlertDescription className="text-amber-700">
                    <p className="mb-2">
                      Le mappature PMS per questa struttura non sono ancora state configurate dal SuperAdmin.
                    </p>
                    {isSuperAdmin && (
                      <a
                        href="/superadmin/connectors-mapping"
                        className="inline-flex items-center gap-2 mt-3 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                      >
                        <Settings2 className="h-4 w-4" />
                        Vai alla configurazione Connectors
                      </a>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {pmsName === "scidoo" && integrationMode === "api" && (
                    <ScidooSyncPanel hotelId={selectedHotel.id} pmsIntegrationId={pmsIntegration.id} isSuperAdmin={isSuperAdmin} />
                  )}
                  {pmsName === "brig" && integrationMode === "api" && (
                    <BrigSyncPanel hotelId={selectedHotel.id} pmsIntegrationId={pmsIntegration.id} isSuperAdmin={isSuperAdmin} />
                  )}
                  {pmsName === "slope" && integrationMode === "api" && (
                    <SlopeSyncPanel hotelId={selectedHotel.id} isSuperAdmin={isSuperAdmin} />
                  )}
                  {isGSheetsMode && (
                    <GSheetsSyncPanel
                      hotelId={selectedHotel.id}
                      spreadsheetId={pmsIntegration.config?.spreadsheet_id || null}
                      bookingTab={pmsIntegration.config?.gsheets_mapping?.prenotazioni?.sheetTab}
                      availabilityTab={pmsIntegration.config?.gsheets_mapping?.disponibilita?.sheetTab}
                      lastSyncAt={pmsIntegration.last_sync_at}
                      lastSyncStatus={pmsIntegration.last_sync_status}
                      gsheetsMapping={pmsIntegration.config?.gsheets_mapping}
                    />
                  )}
                  <RoomTypesManager
                hotelId={selectedHotel.id}
                initialRoomTypes={roomTypes}
                integrationMode={integrationMode}
                isSuperAdmin={isSuperAdmin}
                pmsName={pmsName}
              />
                  <RatesManager hotelId={selectedHotel.id} integrationMode={integrationMode} />
                  {/* Pannello agnostico: si auto-mostra se il connector ha capability push_rates.
                      Niente switch sul pms_name qui — il componente chiama /api/pms/capabilities
                      che legge il registry centrale (lib/connectors/registry.ts). */}
                  <PublishRatesPanel hotelId={selectedHotel.id} pmsIntegrationId={pmsIntegration.id} />
                </>
              )}
            </>
          )}

          {/* Help section for GSheets */}
          {isGSheetsMode && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  Come funziona la modalita Google Sheets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Formato dei dati</h3>
                  <p className="text-sm text-muted-foreground">
                    Il foglio Google deve contenere tre schede: <strong>Disponibilita</strong>, <strong>Prenotazioni</strong> e <strong>Tariffe</strong>.
                    Usa il template fornito per il formato corretto.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Frequenza di sincronizzazione</h3>
                  <p className="text-sm text-muted-foreground">
                    I dati vengono letti automaticamente ogni ora. Puoi anche forzare una sincronizzazione manuale.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Permessi necessari</h3>
                  <p className="text-sm text-muted-foreground">
                    Assicurati che il foglio sia condiviso con il service account indicato nella configurazione sopra.
                    E sufficiente il permesso di &quot;Visualizzatore&quot;.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Help section for API - only for scidoo */}
          {!isGSheetsMode && pmsName === "scidoo" && (
            <Card>
              <CardHeader>
                <CardTitle>Come ottenere le credenziali API Scidoo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">1. Accedi al tuo account Scidoo</h3>
                  <p className="text-sm text-muted-foreground">
                    Vai su{" "}
                    <a href="https://www.scidoo.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      www.scidoo.com
                    </a>{" "}
                    e accedi con le tue credenziali
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">2. Richiedi l{"'"}API Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Contatta il supporto Scidoo per richiedere l{"'"}attivazione delle API e ottenere la tua API Key
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">3. Inserisci le credenziali</h3>
                  <p className="text-sm text-muted-foreground">
                    Una volta ottenute, inserisci l{"'"}API Key nel form sopra e salva la configurazione
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
