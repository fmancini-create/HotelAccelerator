import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { PmsPublicEntry } from "@/lib/pms-public-catalog"

/**
 * Legge il catalogo pubblico (solo voci visibili) lato server.
 * Usa il service-role client cosi' funziona anche per utenti anonimi
 * sul sito vetrina, filtrando esplicitamente is_public = true.
 * Non lancia: in caso di errore ritorna lista vuota (la UI mostra fallback).
 *
 * NB: file separato (server-only) da lib/pms-public-catalog.ts perche'
 * quest'ultimo contiene tipi/costanti importati anche da client component;
 * tenere qui l'accesso a Supabase evita che next/headers finisca nel bundle client.
 */
export async function getPublicPmsCatalog(): Promise<PmsPublicEntry[]> {
  try {
    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase
      .from("pms_public_catalog")
      .select("id,name,slug,status,note,display_order,is_public")
      .eq("is_public", true)
      .order("display_order", { ascending: true })
    if (error) {
      console.error("[v0] getPublicPmsCatalog error:", error.message)
      return []
    }
    return (data as PmsPublicEntry[]) || []
  } catch (err: any) {
    console.error("[v0] getPublicPmsCatalog exception:", err?.message)
    return []
  }
}
