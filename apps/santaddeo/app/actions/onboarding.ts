"use server"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateItalianVat } from "@/lib/utils/vat-validator"
import { hotelTypeSupportsStars, getRegionByProvinceCode } from "@/lib/utils/hotel-categorization"
import { normalizePmsSelection } from "@/lib/connectors/brig/sub-pms"

export async function completeOnboarding(formData: {
  companyName: string
  vatNumber: string
  organizationName: string
  hotelName: string
  totalRooms: number
  accommodationType?: string
  address: string
  city: string
  country: string
  // 12/05/2026: nuovi campi anagrafici raccolti in onboarding obbligatorio.
  // Aggiunti per evitare casi come "Nunia in Rome" che si registrava senza
  // contatti / categoria / pms identificabili. Vedi migration
  // `add_hotel_contact_categorization`.
  phone?: string
  website?: string
  contactEmail?: string
  hotelType?: string
  stars?: number | null
  province?: string
  region?: string
  pmsName: string
  pmsOther?: string
  scidooApiKey?: string
}) {
  try {
    // Validazione strutturale P.IVA italiana (Luhn-like checksum).
    // Server-side, doppio gate con la validazione UI: copre form bypass + API.
    const vatCheck = validateItalianVat(formData.vatNumber)
    if (!vatCheck.valid) {
      return { success: false, error: vatCheck.reason }
    }
    formData.vatNumber = vatCheck.normalized

    // Sanity check: hotel_type con/senza stars devono essere coerenti.
    // Se il tipo NON prevede stelle (B&B, casa vacanze, ecc.) forziamo a null.
    if (formData.hotelType && !hotelTypeSupportsStars(formData.hotelType)) {
      formData.stars = null
    }
    // Se la provincia e' settata ma manca la regione, la deduciamo (FI -> Toscana).
    if (formData.province && !formData.region) {
      formData.region = getRegionByProvinceCode(formData.province) || undefined
    }
    // SSR client per leggere user da cookie
    const userSupabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await userSupabase.auth.getUser()

    console.log("[v0] completeOnboarding - User check:", {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      userError: userError?.message,
    })

    if (userError || !user) {
      console.error("[v0] completeOnboarding - User not authenticated:", userError)
      throw new Error("User not authenticated")
    }

    // Service-role client per tutte le scritture (bypassa RLS).
    // BUG FIX (29/04/2026): prima usavamo `userSupabase` (anon) per chiamare
    // `auth.admin.getUserById`, che non funziona col client anon. Risultato:
    // `accountType` cadeva sempre nel fallback "hotel" anche per consultant,
    // creando organization con type sbagliato.
    const supabase = await createServiceRoleClient()

    // Check se l'utente ha gia' un'organization
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("organization_id, setup_completed")
      .eq("id", user.id)
      .single()

    console.log("[v0] completeOnboarding - Existing profile:", {
      hasProfile: !!existingProfile,
      organizationId: existingProfile?.organization_id,
      setupCompleted: existingProfile?.setup_completed,
    })

    let organizationId = existingProfile?.organization_id

    // Crea organization se non esiste
    if (!organizationId) {
      // Auth admin ora usa il client service role: legittimo
      const { data: userData } = await supabase.auth.admin.getUserById(user.id)
      const accountType = userData?.user?.user_metadata?.account_type || "hotel"
      const orgType = accountType === "consultant" ? "consultant" : "hotel"

      console.log("[v0] completeOnboarding - Creating organization:", {
        name: formData.organizationName,
        type: orgType,
        accountType,
      })

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: formData.organizationName,
          type: orgType,
          company_name: formData.companyName,
          vat_number: formData.vatNumber,
        })
        .select()
        .single()

      if (orgError) {
        console.error("[v0] completeOnboarding - Organization creation error:", orgError)
        throw orgError
      }

      organizationId = org.id
      console.log("[v0] completeOnboarding - Organization created:", organizationId)

      // Linka organization al profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ organization_id: organizationId })
        .eq("id", user.id)

      if (profileError) {
        console.error("[v0] completeOnboarding - Profile update error:", profileError)
        throw profileError
      }

      console.log("[v0] completeOnboarding - Profile updated with organization_id")

      // FIX 12/05/2026: aggiorniamo anche `auth.users.user_metadata` con
      // organization_id. Il dashboard usa questo claim JWT come prima opzione
      // per filtrare gli hotel (vedi `dashboard-content.tsx` → `jwtOrgId`).
      // Senza questo update, il primo login post-onboarding NON vedeva i
      // propri hotel perché jwtOrgId era undefined e il fallback su
      // user_property_map è vuoto per chi si è registrato (popolato solo
      // per inviti accettati). Risultato pre-fix: utente vedeva l'empty
      // state DEV "Il database DEV non contiene hotel..." anche se l'hotel
      // era stato creato correttamente.
      try {
        const { data: existingUser } = await supabase.auth.admin.getUserById(user.id)
        const existingMetadata = (existingUser?.user?.user_metadata as Record<string, unknown>) || {}
        const { error: metaErr } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...existingMetadata,
            organization_id: organizationId,
          },
        })
        if (metaErr) {
          console.warn(
            "[v0] completeOnboarding - user_metadata update warning:",
            metaErr.message,
          )
        } else {
          console.log("[v0] completeOnboarding - user_metadata updated with organization_id")
        }
      } catch (e) {
        console.warn("[v0] completeOnboarding - user_metadata update threw:", e)
      }
    }

    // Crea hotel
    console.log("[v0] completeOnboarding - Creating hotel for organization:", organizationId)

    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .insert({
        organization_id: organizationId,
        name: formData.hotelName,
        total_rooms: formData.totalRooms,
        accommodation_type: formData.accommodationType || "camere",
        address: formData.address,
        city: formData.city,
        country: formData.country,
        // Nuovi campi anagrafica estesa (migration 12/05/2026).
        // Normalizzo stringhe vuote a null per evitare empty strings in DB.
        phone: formData.phone?.trim() || null,
        website: formData.website?.trim() || null,
        contact_email: formData.contactEmail?.trim() || null,
        hotel_type: formData.hotelType || null,
        stars: formData.stars ?? null,
        province: formData.province?.trim() || null,
        region: formData.region?.trim() || null,
      })
      .select()
      .single()

    if (hotelError) {
      console.error("[v0] completeOnboarding - Hotel creation error:", hotelError)
      throw hotelError
    }

    console.log("[v0] completeOnboarding - Hotel created:", hotel.id)

    // FIX 23/06/2026: registra il PROPRIETARIO in `user_property_map`.
    // Finora l'onboarding legava l'hotel solo via `organization_id`: la
    // dashboard funzionava (usa jwtOrgId) ma il dialog "Gestisci strutture"
    // del superadmin legge `user_property_map` e mostrava l'hotel NON flaggato
    // anche se l'utente ne era a tutti gli effetti il proprietario. Inseriamo
    // quindi la mappatura esplicita con permessi pieni (idempotente su
    // user_id+hotel_id). Best-effort: non blocchiamo l'onboarding se fallisce.
    try {
      const { error: upmErr } = await supabase.from("user_property_map").upsert(
        {
          user_id: user.id,
          hotel_id: hotel.id,
          can_manage: true,
          can_view_financials: true,
          can_sync_data: true,
          can_manage_team: true,
          assigned_by: user.id,
        },
        { onConflict: "user_id,hotel_id" },
      )
      if (upmErr) {
        console.warn("[v0] completeOnboarding - user_property_map upsert warning:", upmErr.message)
      } else {
        console.log("[v0] completeOnboarding - Owner mapped in user_property_map:", user.id, "→", hotel.id)
      }
    } catch (e) {
      console.warn("[v0] completeOnboarding - user_property_map upsert threw:", e instanceof Error ? e.message : String(e))
    }

    // Sales CRM: se questo utente arrivava da un lead di un venditore,
    // creiamo l'associazione hotel→venditore e marchiamo il lead come
    // 'converted'. Best-effort: se fallisce non blocchiamo l'onboarding.
    try {
      const { attachHotelToSalesAgentIfLead } = await import("@/lib/sales/lead-tracking")
      const result = await attachHotelToSalesAgentIfLead({
        userId: user.id,
        hotelId: hotel.id,
      })
      if (result.associated) {
        console.log(
          "[v0] completeOnboarding - Sales agent associated:",
          result.salesAgentId,
          "→ hotel",
          hotel.id,
        )
      }
    } catch (e) {
      console.warn("[v0] completeOnboarding - sales attach error (non-blocking):", e)
    }

    const rawPmsName = formData.pmsName === "other" ? formData.pmsOther : formData.pmsName
    const isScidoo = formData.pmsName === "scidoo"

    // NORMALIZZAZIONE sub-PMS BRiG (24/06/2026): Slope, Mews, Octorate, ... non
    // hanno un connector dedicato, si raggiungono SOLO tramite il bridge BRiG.
    // Vanno quindi salvati in forma canonica pms_name='brig' + config.brig_sub_pms,
    // altrimenti il cron sync-modules (che dispatcha solo su pms_name 'brig'/'scidoo')
    // li marcherebbe `unsupported_pms` e l'hotel non verrebbe mai sincronizzato.
    const { pmsName, brigSubPms } = normalizePmsSelection(rawPmsName)

    // Costruzione config: api_key Scidoo (se fornita) + sub-PMS BRiG (se applicabile).
    const pmsConfig: Record<string, unknown> = {}
    if (isScidoo && formData.scidooApiKey) pmsConfig.api_key = formData.scidooApiKey
    if (brigSubPms) pmsConfig.brig_sub_pms = brigSubPms

    console.log("[v0] completeOnboarding - Creating PMS integration:", {
      hotelId: hotel.id,
      rawPmsName,
      pmsName,
      brigSubPms,
      isScidoo,
    })

    const { error: pmsError } = await supabase.from("pms_integrations").insert({
      hotel_id: hotel.id,
      pms_name: pmsName,
      is_active: isScidoo && formData.scidooApiKey ? true : false,
      config: Object.keys(pmsConfig).length > 0 ? pmsConfig : null,
    })

    if (pmsError) {
      console.error("[v0] completeOnboarding - PMS integration error:", pmsError)
      throw pmsError
    }

    console.log("[v0] completeOnboarding - PMS integration created successfully")

    // Marca il setup come completato. Cosi' la onboarding-route puo' fare
    // fast path direttamente alla dashboard senza ricontrollare hotels.
    const { error: setupErr } = await supabase
      .from("profiles")
      .update({ setup_completed: true, updated_at: new Date().toISOString() })
      .eq("id", user.id)
    if (setupErr) {
      console.warn("[v0] completeOnboarding - setup_completed update warning:", setupErr.message)
    }

    // Seed default KPI configs per il nuovo hotel
    const { seedDefaultKpiConfigs } = await import("@/lib/utils/kpi-visibility")
    const kpiResult = await seedDefaultKpiConfigs(supabase, hotel.id)
    console.log("[v0] completeOnboarding - KPI seed result:", kpiResult)

    revalidatePath("/dashboard")
    console.log("[v0] completeOnboarding - Onboarding completed successfully")
    return { success: true }
  } catch (error) {
    console.error("[v0] completeOnboarding - Error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Errore durante la configurazione",
    }
  }
}
