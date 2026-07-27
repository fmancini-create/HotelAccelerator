/**
 * Risoluzione del tenant (property_id) per un chiamante già autenticato.
 *
 * PERCHÉ ESISTE: la stessa logica serviva in più punti (letture ManuBot, todos)
 * e stava per essere copiata una terza volta. Le regole di tenant isolation
 * devono vivere in UN SOLO posto: se divergono, una copia prima o poi diventa
 * permissiva.
 *
 * Questo modulo risolve SOLO l'identificativo del tenant e ne verifica
 * l'esistenza. Non legge credenziali di servizi esterni: quel controllo
 * aggiuntivo sta in `lib/manubot/tenant-context.ts`, che si appoggia a questo
 * helper. La distinzione è voluta — i dati locali (es. `todos`) devono restare
 * leggibili anche per una struttura che non ha alcuna integrazione configurata.
 *
 * GARANZIE:
 *  - Tenant isolation: un tenant admin può risolvere solo la propria property;
 *    un `property_id` altrui riceve 403, mai i dati.
 *  - Un super admin senza tenant attivo riceve `property_required`: nessun
 *    fallback silenzioso su una property "di default".
 *  - Solo SELECT su `properties`, limitata alla colonna `id`.
 *  - `api_token` / `api_token_hash` e le colonne credenziali non vengono mai
 *    selezionati.
 *  - Nessun valore sensibile viene loggato o restituito.
 */

import type { CallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PropertyScopeResolution =
  | { ok: true; propertyId: string }
  | { ok: false; status: number; error: string; message?: string }

/**
 * Risolve il `property_id` su cui il chiamante può operare.
 *
 * NOTA sul super admin: `getCallerIdentity` popola già `identity.propertyId`
 * dall'override attivo (cookie `ha_active_property_id` oppure `?property_id=`,
 * vedi lib/platform-context.ts). Passare `requested` esplicitamente resta utile
 * perché rende la validazione osservabile: senza di esso un UUID malformato
 * verrebbe semplicemente ignorato dall'override e il chiamante riceverebbe un
 * generico "nessun tenant" invece di `invalid_property_id`.
 *
 * @param identity  esito del guard, già verificato non-null
 * @param requested `property_id` esplicito (query string o body), opzionale
 * @param options   `verifyExists: false` per saltare il SELECT di verifica
 */
export async function resolvePropertyIdForCaller(
  identity: CallerIdentity,
  requested?: string | null,
  options: { verifyExists?: boolean } = {},
): Promise<PropertyScopeResolution> {
  const { verifyExists = true } = options
  const requestedPropertyId = requested?.trim() || null

  if (requestedPropertyId && !UUID_RE.test(requestedPropertyId)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_property_id",
      message: "Il parametro property_id non è un identificativo valido.",
    }
  }

  let propertyId: string

  if (requestedPropertyId) {
    // TENANT ISOLATION: solo il super admin può indicare un tenant diverso dal
    // proprio. Per un tenant admin la richiesta viene NEGATA, non silenziosamente
    // ricondotta alla sua property: un 403 esplicito evita che il client creda di
    // stare leggendo i dati che ha chiesto.
    if (!identity.isSuperAdmin && requestedPropertyId !== identity.propertyId) {
      return {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Non hai accesso a questa struttura.",
      }
    }
    propertyId = requestedPropertyId
  } else {
    if (!identity.propertyId) {
      // Caso tipico del super admin senza tenant selezionato.
      return {
        ok: false,
        status: 400,
        error: "property_required",
        message: "Nessun tenant attivo: seleziona una struttura o indica property_id nella richiesta.",
      }
    }
    propertyId = identity.propertyId
  }

  if (!verifyExists) {
    return { ok: true, propertyId }
  }

  // Verifica di esistenza: senza di essa un property_id inesistente produrrebbe
  // una lista vuota indistinguibile da "nessun dato", che è il tipo di risposta
  // ambigua che fa sembrare rotto un endpoint funzionante.
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle()

  if (error) {
    console.error("[v0] property-scope: lookup failed:", error.message)
    return { ok: false, status: 500, error: "internal_error" }
  }
  if (!data) {
    return {
      ok: false,
      status: 404,
      error: "property_not_found",
      message: "Struttura non trovata.",
    }
  }

  return { ok: true, propertyId }
}
