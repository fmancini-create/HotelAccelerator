/**
 * SONDA TEMPORANEA (da eliminare): stampa il menu che vedra' ogni utente VERO
 * della struttura, usando i moduli attivi veri e le aree concesse vere.
 *
 * Serve perche' le pagine non sono verificabili a schermo (l'accesso richiede
 * una sessione reale) e un elenco di prove sintetiche non dice cosa vedra'
 * davvero una persona in carne e ossa.
 */

import { createClient } from "@supabase/supabase-js"
import {
  OPERATIVE_PRIMARY,
  OPERATIVE_SECONDARY,
  SETTINGS_ENTRIES,
  visibleEntries,
} from "../lib/platform/nav"

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: tm } = await sb.from("tenant_modules").select("module_key,status")
  const activeModules = (tm ?? [])
    .filter((r: any) => r.status === "active")
    .map((r: any) => r.module_key as string)
  console.log("Moduli attivi (veri):", activeModules.join(", "))

  const { data: users, error } = await sb
    .from("admin_users")
    .select("id,email,role,can_manage_users,is_tenant_admin")
    .limit(20)
  if (error) {
    console.log("errore lettura utenti:", error.message)
    return
  }

  console.log(`\nUtenti trovati: ${users?.length ?? 0}\n`)

  for (const u of users ?? []) {
    const isAdmin = u.role === "super_admin" || u.role === "admin" || !!u.is_tenant_admin

    // Aree concesse: dirette (user_area_permissions) + via gruppo
    // (user_group_members -> group_area_permissions). Sono i nomi che usa
    // lib/auth/area-access.ts: letti dal codice, non indovinati.
    const areas = new Set<string>()

    const dirette = await sb.from("user_area_permissions").select("*").eq("user_id", u.id)
    if (dirette.error) {
      console.log(`   (aree dirette non leggibili: ${dirette.error.message})`)
    } else {
      for (const r of dirette.data ?? []) {
        const chiave = (r as any).area_key ?? (r as any).area
        if (chiave && ((r as any).granted ?? true)) areas.add(chiave)
      }
    }

    const gruppi = await sb.from("user_group_members").select("group_id").eq("user_id", u.id)
    if (!gruppi.error && (gruppi.data ?? []).length > 0) {
      const ids = (gruppi.data ?? []).map((r: any) => r.group_id)
      const perGruppo = await sb.from("group_area_permissions").select("*").in("group_id", ids)
      if (perGruppo.error) {
        console.log(`   (aree di gruppo non leggibili: ${perGruppo.error.message})`)
      } else {
        for (const r of perGruppo.data ?? []) {
          const chiave = (r as any).area_key ?? (r as any).area
          if (chiave && ((r as any).granted ?? true)) areas.add(chiave)
        }
      }
    }

    const viewer = {
      isAdmin,
      areas: [...areas],
      activeModules,
      canManageUsers: !!u.can_manage_users,
    }
    const barra = visibleEntries(OPERATIVE_PRIMARY, viewer).map((e) => e.label)
    const altro = visibleEntries(OPERATIVE_SECONDARY, viewer).map((e) => e.label)
    const imp = visibleEntries(SETTINGS_ENTRIES, viewer).map((e) => e.label)

    console.log(`── ${u.email}  [${u.role}${u.is_active === false ? ", disattivato" : ""}]`)
    console.log(`   aree concesse: ${areas.length ? areas.join(", ") : "(nessuna)"}`)
    console.log(`   BARRA:        ${barra.join(" | ") || "(vuota)"}`)
    console.log(`   ALTRO:        ${altro.join(" | ") || "(vuoto)"}`)
    console.log(`   IMPOSTAZIONI: ${imp.join(" | ") || "(vuoto -> la tendina non compare)"}`)
    console.log("")
  }
}

main()
