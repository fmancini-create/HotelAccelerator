#!/usr/bin/env node
/**
 * Simulazione a secco: chi verrebbe bloccato SE la guardia fosse attivata?
 *
 * Da eseguire PRIMA di mettere AREA_GUARD_MODE=enforce. Attivare un presidio
 * senza sapere quante persone colpisce e' il modo piu' rapido per bloccare
 * utenti legittimi e doverlo spegnere in fretta.
 *
 * Legge i permessi veri dal database e li incrocia con la mappa delle rotte.
 * Non modifica nulla.
 */

import { createClient } from "@supabase/supabase-js"
import { resolveApiArea } from "../lib/auth/api-area-map.ts"
import { BASELINE_AREA_KEYS } from "../lib/platform/areas.ts"

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nell'ambiente.")
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

// Rotte rappresentative delle aree concedibili: sono le uniche dove la guardia
// puo' davvero cambiare l'esito.
const ROTTE_CAMPIONE = [
  "/api/admin/crm/contacts",
  "/api/admin/todos",
  "/api/admin/photos",
  "/api/admin/marketing/campaigns",
  "/api/cms/pages",
  "/api/admin/tracking/sites",
  "/api/admin/embed-scripts",
  "/api/admin/message-rules",
  "/api/admin/monitoring",
  "/api/inbox/conversations",
]

async function main() {
  const { data: utenti, error } = await db
    .from("admin_users")
    .select("id, email, property_id, is_tenant_admin")
    .order("email")

  if (error) {
    console.error("Lettura utenti fallita:", error.message)
    process.exit(1)
  }

  console.log(`Utenti nel sistema: ${utenti.length}\n`)

  let bloccatiTotali = 0

  for (const u of utenti) {
    if (u.is_tenant_admin) {
      console.log(`${u.email}  [admin del tenant] -> passa ovunque, nessun blocco.\n`)
      continue
    }

    const { data: dirette } = await db
      .from("user_area_permissions")
      .select("area_key")
      .eq("user_id", u.id)
      .eq("property_id", u.property_id)

    const { data: gruppi } = await db.from("user_group_members").select("group_id").eq("user_id", u.id)
    const idGruppi = (gruppi ?? []).map((g) => g.group_id).filter(Boolean)

    let daGruppi = []
    if (idGruppi.length > 0) {
      const { data } = await db
        .from("group_area_permissions")
        .select("area_key")
        .eq("property_id", u.property_id)
        .in("group_id", idGruppi)
      daGruppi = data ?? []
    }

    const effettive = new Set([
      ...BASELINE_AREA_KEYS,
      ...(dirette ?? []).map((r) => r.area_key),
      ...daGruppi.map((r) => r.area_key),
    ])

    console.log(`${u.email}  [membro]`)
    console.log(`  aree effettive: ${Array.from(effettive).sort().join(", ")}`)

    const bloccate = []
    for (const rotta of ROTTE_CAMPIONE) {
      const area = resolveApiArea(rotta)
      if (!area) continue
      if (!effettive.has(area)) bloccate.push(`${rotta} (area ${area})`)
    }

    bloccatiTotali += bloccate.length
    if (bloccate.length === 0) {
      console.log("  bloccate: nessuna\n")
    } else {
      console.log(`  bloccate: ${bloccate.length} su ${ROTTE_CAMPIONE.length}`)
      for (const b of bloccate) console.log(`    - ${b}`)
      console.log("")
    }
  }

  console.log("---")
  console.log(`Blocchi totali che l'attivazione produrrebbe: ${bloccatiTotali}`)
  if (bloccatiTotali === 0) {
    console.log("Nessuno verrebbe bloccato: l'attivazione sarebbe inerte sui dati attuali.")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
