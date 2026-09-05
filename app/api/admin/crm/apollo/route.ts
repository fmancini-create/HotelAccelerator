import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import {
  ApolloConfigurationError,
  ApolloRequestError,
  enrichApolloPersonWithUsage,
  searchApolloPeople,
} from "@/lib/integrations/apollo/client"

const searchSchema = z.object({
  action: z.literal("search"),
  keywords: z.string().trim().max(120).default("hotel,hospitality"),
  titles: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  seniorities: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  organizationLocations: z.array(z.string().trim().min(1).max(80)).max(8).default(["Italy"]),
  page: z.number().int().min(1).max(500).default(1),
  perPage: z.number().int().min(1).max(50).default(25),
})

const personSchema = z.object({
  id: z.string().trim().min(1).max(120),
  firstName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().max(120).nullable().optional(),
  lastNameObfuscated: z.boolean().optional(),
  fullName: z.string().trim().min(1).max(240),
  title: z.string().trim().max(180).nullable().optional(),
  seniority: z.string().trim().max(80).nullable().optional(),
  linkedinUrl: z.string().trim().url().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
  organizationName: z.string().trim().max(240).nullable().optional(),
  organizationDomain: z.string().trim().max(240).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  emailStatus: z.string().trim().max(80).nullable().optional(),
})

const actionSchema = z.discriminatedUnion("action", [
  searchSchema,
  z.object({ action: z.literal("save"), person: personSchema }),
  z.object({
    action: z.literal("enrich"),
    prospectId: z.string().uuid(),
    confirmCredit: z.literal(true),
  }),
  z.object({ action: z.literal("import"), prospectId: z.string().uuid() }),
  z.object({ action: z.literal("dismiss"), prospectId: z.string().uuid() }),
])

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return { firstName: parts[0] || null, lastName: parts.slice(1).join(" ") || null }
}

function providerError(error: unknown) {
  if (error instanceof ApolloConfigurationError) {
    return NextResponse.json({ error: error.message, configured: false }, { status: 503 })
  }
  if (error instanceof ApolloRequestError) {
    return NextResponse.json(
      { error: error.message, retryAfter: error.retryAfter },
      { status: error.status === 429 ? 429 : 502 },
    )
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const supabase = createServiceClient()
    const [{ data, error }, { data: recentSearches, error: historyError }] = await Promise.all([
      supabase
        .from("crm_apollo_prospects")
        .select("*")
        .eq("property_id", propertyId)
        .neq("status", "dismissed")
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("crm_scout_searches")
        .select("id,keywords,titles,seniorities,organization_locations,page,per_page,total_entries,total_pages,people,created_at")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(20),
    ])
    if (error) throw error
    if (historyError) throw historyError
    return NextResponse.json({
      configured: Boolean(process.env.APOLLO_API_KEY?.trim()),
      prospects: data ?? [],
      recentSearches: recentSearches ?? [],
      policy: {
        searchCredits: 0,
        enrichmentMaxCredits: 1,
        automaticOutreach: false,
        consentInherited: false,
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Apollo CRM list error:", error)
    return NextResponse.json({ error: "Impossibile leggere i prospect Apollo." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const body = actionSchema.parse(await request.json())
    const supabase = createServiceClient()

    if (body.action === "search") {
      const result = await searchApolloPeople(body)
      const { data: searchRow, error: searchSaveError } = await supabase
        .from("crm_scout_searches")
        .insert({
          property_id: propertyId,
          keywords: body.keywords,
          titles: body.titles,
          seniorities: body.seniorities,
          organization_locations: body.organizationLocations,
          page: result.page,
          per_page: result.perPage,
          total_entries: result.totalEntries,
          total_pages: result.totalPages,
          people: result.people,
        })
        .select("id,created_at")
        .single()
      if (searchSaveError) throw searchSaveError
      return NextResponse.json({ ...result, creditCost: 0, searchId: searchRow.id, searchedAt: searchRow.created_at })
    }

    if (body.action === "save") {
      const p = body.person
      const { data, error } = await supabase
        .from("crm_apollo_prospects")
        .upsert(
          {
            property_id: propertyId,
            apollo_person_id: p.id,
            first_name: p.firstName ?? null,
            last_name: p.lastName ?? null,
            full_name: p.fullName,
            job_title: p.title ?? null,
            seniority: p.seniority ?? null,
            organization_name: p.organizationName ?? null,
            organization_domain: p.organizationDomain ?? null,
            linkedin_url: p.linkedinUrl ?? null,
            city: p.city ?? null,
            region: p.region ?? null,
            country: p.country ?? null,
            email: p.email?.toLowerCase() ?? null,
            email_status: p.emailStatus ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "property_id,apollo_person_id" },
        )
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ prospect: data, creditCost: 0 })
    }

    const { data: prospect, error: prospectError } = await supabase
      .from("crm_apollo_prospects")
      .select("*")
      .eq("id", body.prospectId)
      .eq("property_id", propertyId)
      .single()
    if (prospectError || !prospect) {
      return NextResponse.json({ error: "Prospect non trovato nel tenant attivo." }, { status: 404 })
    }

    if (body.action === "dismiss") {
      const { error } = await supabase
        .from("crm_apollo_prospects")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", prospect.id)
        .eq("property_id", propertyId)
      if (error) throw error
      return NextResponse.json({ ok: true, creditCost: 0 })
    }

    if (body.action === "enrich") {
      // Server-side idempotency: a click ripetuto non deve mai generare una
      // seconda richiesta fatturabile se questo profilo e' gia stato verificato.
      if (prospect.status === "enriched" || prospect.email) {
        return NextResponse.json({
          prospect,
          creditCost: 0,
          reused: true,
          outcome: prospect.email ? "email_found" : "email_unavailable",
          message: prospect.email
            ? "Il recapito era gia stato verificato: nessun nuovo credito Scout utilizzato."
            : "Il profilo era gia stato verificato senza recapito: nessun nuovo credito Scout utilizzato.",
        })
      }

      const enrichment = await enrichApolloPersonWithUsage(prospect.apollo_person_id)
      const enriched = enrichment.person
      if (!enriched) {
        // Il provider dichiara il consumo esatto anche quando non trova un match.
        // Lo restituiamo comunque al wrapper di metering per la riconciliazione.
        return NextResponse.json({
          error: "Apollo non ha trovato dati aggiuntivi per questo profilo.",
          creditCost: enrichment.creditsConsumed,
        }, { status: 404 })
      }
      const { data, error } = await supabase
        .from("crm_apollo_prospects")
        .update({
          first_name: enriched.firstName ?? prospect.first_name,
          last_name: enriched.lastName ?? prospect.last_name,
          full_name: enriched.fullName || prospect.full_name,
          job_title: enriched.title ?? prospect.job_title,
          seniority: enriched.seniority ?? prospect.seniority,
          organization_name: enriched.organizationName ?? prospect.organization_name,
          organization_domain: enriched.organizationDomain ?? prospect.organization_domain,
          linkedin_url: enriched.linkedinUrl ?? prospect.linkedin_url,
          city: enriched.city ?? prospect.city,
          region: enriched.region ?? prospect.region,
          country: enriched.country ?? prospect.country,
          email: enriched.email?.toLowerCase() ?? prospect.email,
          email_status: enriched.emailStatus ?? prospect.email_status,
          status: "enriched",
          enriched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", prospect.id)
        .eq("property_id", propertyId)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({
        prospect: data,
        creditCost: enrichment.creditsConsumed,
        outcome: data.email ? "email_found" : "email_unavailable",
        message: data.email
          ? "Email trovata da Apollo."
          : "Apollo ha verificato il profilo ma non ha un'email disponibile.",
      })
    }

    const email = String(prospect.email ?? "").trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: "Prima di importare devi ottenere un'email verificabile da Apollo." }, { status: 409 })
    }

    const { data: existing, error: existingError } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", propertyId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle()
    if (existingError) throw existingError

    let contactId = existing?.id as string | undefined
    if (!contactId) {
      const names = splitName(prospect.full_name || "")
      const { data: inserted, error: insertError } = await supabase
        .from("contacts")
        .insert({
          property_id: propertyId,
          name: prospect.full_name || [names.firstName, names.lastName].filter(Boolean).join(" "),
          email,
          company: prospect.organization_name,
          city: prospect.city,
          country: prospect.country,
          source: "apollo",
          marketing_consent: false,
          unsubscribed: false,
        })
        .select("id")
        .single()
      if (insertError) {
        if (insertError.code !== "23505") throw insertError
        const { data: concurrent, error: concurrentError } = await supabase
          .from("contacts")
          .select("id")
          .eq("property_id", propertyId)
          .ilike("email", email)
          .limit(1)
          .single()
        if (concurrentError) throw concurrentError
        contactId = concurrent.id
      } else {
        contactId = inserted.id
      }
    }

    const { data, error } = await supabase
      .from("crm_apollo_prospects")
      .update({
        status: "imported",
        contact_id: contactId,
        imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospect.id)
      .eq("property_id", propertyId)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ prospect: data, contactId, existing: Boolean(existing), creditCost: 0 })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const apollo = providerError(error)
    if (apollo) return apollo
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Richiesta Apollo non valida.", details: error.flatten() }, { status: 400 })
    }
    console.error("Apollo CRM action error:", error)
    return NextResponse.json({ error: "Operazione Apollo non completata." }, { status: 500 })
  }
}
