import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { HotelMappingsViewer } from "@/components/settings/hotel-mappings-viewer"
import { GDocsRoomTypeMappingEditor } from "@/components/settings/gdocs-room-type-mapping"
import { RateMappingEditor } from "@/components/settings/rate-mapping-editor"
import { MappingsHelpIntro } from "@/components/settings/mappings-help-intro"

export const dynamic = "force-dynamic"

export default async function MappingsSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  const isSuperAdmin = data.isSuperAdmin
  // Always use service role to bypass RLS - auth is already checked by getSettingsData
  const supabase = await createClient()

  // Use the selectedHotel from the settings API (respects impersonation cookie)
  const selectedHotel = data.selectedHotel

  if (!selectedHotel) {
    redirect(isSuperAdmin ? "/superadmin" : "/onboarding")
  }

  // Recupera le mappature specifiche dell'hotel (room_type, rate_plan, etc.)
  const { data: hotelMappings } = await supabase
    .from("pms_rms_mappings")
    .select("*")
    .eq("hotel_id", selectedHotel.id)
    .order("pms_entity_type", { ascending: true })

  // Recupera le mappature globali di sistema (booking_status, document_type, etc.)
  const { data: globalMappings } = await supabase
    .from("pms_rms_mappings")
    .select("*")
    .is("hotel_id", null)
    .not("pms_entity_type", "in", "(room_type,rate_plan,channel,payment_method,meal_plan,arrangement)")
    .order("pms_entity_type", { ascending: true })

  const mappings = [...(hotelMappings || []), ...(globalMappings || [])]

  // Recupera il PMS provider collegato (inclusa la configurazione per spreadsheet_id)
  const { data: pmsIntegration } = await supabase
    .from("pms_integrations")
    .select("pms_name, integration_mode, config, gsheet_spreadsheet_id")
    .eq("hotel_id", selectedHotel.id)
    .maybeSingle()

  // Recupera stato ETL
  const { data: etlStatus } = await supabase
    .rpc("can_run_etl", { p_hotel_id: selectedHotel.id })
    .single()

  // Recupera binding hotel
  const { data: hotelBinding } = await supabase
    .from("hotel_bindings")
    .select("*, pms_providers(name, code)")
    .eq("hotel_id", selectedHotel.id)
    .maybeSingle()

  // Recupera room_types esistenti per l'hotel
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, scidoo_room_type_id, total_rooms")
    .eq("hotel_id", selectedHotel.id)
    .eq("is_active", true)

  // Determina se l'hotel usa GDocs/Bedzzle (modalita' gsheets)
  // Può essere "gsheets" o il provider può essere "bedzzle" o "gdocs"
  const pmsProviderCode = hotelBinding?.pms_providers?.code || pmsIntegration?.pms_name || "unknown"
  const isGSheetsMode = pmsIntegration?.integration_mode === "gsheets" || 
                        pmsProviderCode.toLowerCase() === "bedzzle" || 
                        pmsProviderCode.toLowerCase() === "gdocs"

  // Recupera spreadsheet ID dalla colonna dedicata pms_integrations.gsheet_spreadsheet_id
  const spreadsheetId = (pmsIntegration as any)?.gsheet_spreadsheet_id || null

  return (
    <div className="space-y-6">
      {/* Spiegazione semplice della logica di mappatura.
          Pensata per chi entra qui per la prima volta: metafora del menu'
          della pizzeria (margherita = tariffa madre, varianti = tariffe figlie).
          Default aperta, l'utente puo' chiuderla. */}
      <MappingsHelpIntro />

      {/* Rate Mapping Editor - per configurare relazioni tariffe (NR, promo, ecc.).
          Il flag isSuperAdmin abilita il pulsante "Crea Tariffa" custom usato per
          recuperare booking storici con identificatori PMS non piu' sincronizzati. */}
      <RateMappingEditor hotelId={selectedHotel.id} isSuperAdmin={isSuperAdmin} />

      {/* Editor per mappatura room types - SOLO per GDocs/GSheets, NON per API */}
      {isGSheetsMode && (
        <GDocsRoomTypeMappingEditor
          hotelId={selectedHotel.id}
          hotelName={selectedHotel.name}
          pmsProvider={pmsProviderCode}
          spreadsheetId={spreadsheetId}
          existingMappings={hotelMappings || []}
          existingRoomTypes={roomTypes || []}
        />
      )}
      
      <HotelMappingsViewer
        hotel={selectedHotel}
        mappings={mappings || []}
        pmsName={pmsIntegration?.pms_name || "Non configurato"}
        etlStatus={etlStatus}
        hotelBinding={hotelBinding}
      />
    </div>
  )
}
