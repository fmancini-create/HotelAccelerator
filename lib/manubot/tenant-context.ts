/**
 * Risoluzione della property ManuBot per il chiamante autenticato.
 *
 * PERCHÉ ESISTE: le route di lettura ManuBot chiamavano `getManubotClient({})`
 * con oggetto VUOTO. In quel caso il client ricade sulle env globali
 * (`MANUBOT_DEFAULT_EMAIL` / `MANUBOT_DEFAULT_PASSWORD`), quindi un admin di un
 * tenant qualsiasi leggeva i dati ManuBot dell'account di DEFAULT: un leak
 * cross-tenant. Qui la property viene risolta esplicitamente e le credenziali
 * arrivano SEMPRE dalla riga `properties`, mai dalle env.
 *
 * GARANZIE:
 *  - Nessun fallback su env globali: se la property non ha `manubot_email` e
 *    `manubot_password`, si risponde `tenant_not_configured` e non si effettua
 *    alcuna chiamata a ManuBot.
 *  - Tenant isolation: un tenant admin può risolvere solo la propria property;
 *    solo un super admin può indicarne un'altra.
 *  - Un super admin senza tenant attivo riceve `property_required` (nessun
 *    fallback silenzioso sull'account di default).
 *  - `api_token` / `api_token_hash` non vengono mai selezionati né toccati.
 *  - Solo SELECT: nessuna scrittura, nessuno schema modificato.
 *  - I valori delle credenziali non vengono mai loggati né restituiti.
 */

import type { CallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sottoinsieme di `properties` accettato da `getManubotClient`. */
export interface ManubotPropertyCredentials {
  id: string
  manubot_email: string | null
  manubot_password: string | null
  manubot_supabase_url: string | null
  manubot_company_id: string | null
}

export type ManubotPropertyResolution =
  | { ok: true; property: ManubotPropertyCredentials }
  | { ok: false; status: number; error: string; message?: string }

/**
 * Risolve e carica la configurazione ManuBot della property del chiamante.
 *
 * @param identity  esito del guard (deve essere già stato verificato non-null)
 * @param requested `property_id` esplicito (query string o body), opzionale
 */
export async function loadManubotPropertyForCaller(
  identity: CallerIdentity,
  requested?: string | null,
): Promise<ManubotPropertyResolution> {
  const requestedPropertyId = requested?.trim() || null

  if (requestedPropertyId && !UUID_RE.test(requestedPropertyId)) {
    return { ok: false, status: 400, error: "invalid_property_id" }
  }

  // TENANT ISOLATION: solo il super admin può indicare una property diversa.
  let propertyId: string
  if (requestedPropertyId) {
    if (!identity.isSuperAdmin && requestedPropertyId !== identity.propertyId) {
      return { ok: false, status: 403, error: "forbidden" }
    }
    propertyId = requestedPropertyId
  } else {
    if (!identity.propertyId) {
      // Caso tipico del super admin senza impersonificazione attiva. NON si
      // ripiega sulle env globali: si chiede quale tenant leggere.
      return {
        ok: false,
        status: 400,
        error: "property_required",
        message: "Nessun tenant attivo: indica property_id nella richiesta.",
      }
    }
    propertyId = identity.propertyId
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id, manubot_email, manubot_password, manubot_supabase_url, manubot_company_id")
    .eq("id", propertyId)
    .maybeSingle()

  if (error) {
    // Solo il messaggio dell'errore DB, che non contiene credenziali.
    console.error("[v0] manubot tenant-context: lookup failed:", error.message)
    return { ok: false, status: 500, error: "internal_error" }
  }
  if (!data) {
    return { ok: false, status: 404, error: "property_not_found" }
  }

  const property = data as ManubotPropertyCredentials

  // NESSUN FALLBACK ENV: entrambe le credenziali devono stare sulla property.
  // Senza questo controllo `getManubotClient` userebbe le env di default,
  // riaprendo il leak cross-tenant.
  const hasEmail = Boolean(property.manubot_email && property.manubot_email.trim())
  const hasPassword = Boolean(property.manubot_password && property.manubot_password.trim())
  if (!hasEmail || !hasPassword) {
    return {
      ok: false,
      status: 400,
      error: "tenant_not_configured",
      message: "Questa struttura non ha una configurazione ManuBot completa.",
    }
  }

  return { ok: true, property }
}
