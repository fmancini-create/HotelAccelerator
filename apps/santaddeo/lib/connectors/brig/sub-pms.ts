/**
 * Sub-PMS di BRiG: fonte di verità unica (lato codice).
 *
 * BRiG è un bridge unico verso 10+ PMS reali. Nessuno di questi PMS ha un
 * connector dedicato in `lib/connectors/registry.ts`: si raggiungono TUTTI
 * attraverso il connector `brig`. Per questo, quando un hotel "usa Slope"
 * (o Mews, Octorate, ...), nel nostro sistema l'integrazione va salvata in
 * forma CANONICA come:
 *
 *     pms_name           = "brig"
 *     config.brig_sub_pms = "slope"   // il PMS reale dietro il bridge
 *
 * Perché è obbligatorio e non solo cosmetico:
 *  - il cron `sync-modules` (app/api/cron/sync-modules/route.ts) dispatcha
 *    SOLO su `pms_name === "brig"` (flusso BRiG) o `=== "scidoo"`. Qualsiasi
 *    altro valore (es. "slope") viene marcato `unsupported_pms` e saltato →
 *    l'hotel non verrebbe MAI sincronizzato.
 *  - il connector BRiG legge le credenziali per-hotel dalle colonne
 *    api_key / endpoint_url / property_id (structureId), indipendenti dal
 *    sub-PMS.
 *
 * Questa lista DEVE restare allineata con:
 *  - pms_providers.api_extra_config.sub_pms_supported (riga code='brig')
 *  - il CHECK su hotel_bindings.brig_sub_pms
 *  (vedi scripts/2026-04-26-add-brig-*.sql)
 *
 * AGGIORNAMENTO 13/07/2026: "slope" RIMOSSO dalla lista. Slope ora ha un
 * connettore NATIVO (lib/connectors/slope/, pms_name='slope' nel registry)
 * con Partner API dirette: non passa piu' dal bridge BRiG. La selezione
 * "slope" in onboarding resta pms_name='slope' (non viene piu' riscritta
 * in brig+sub_pms).
 */
export const BRIG_SUB_PMS = [
  "bedzzle",
  "5stelle",
  "cloudbeds",
  "hotelcube",
  "mews",
  "octorate",
  "opera",
  "passepartout",
  "zak",
  "apaleo",
] as const

export type BrigSubPms = (typeof BRIG_SUB_PMS)[number]

/** True se `name` (case-insensitive) è uno dei PMS raggiunti tramite BRiG. */
export function isBrigSubPms(name: string | null | undefined): name is BrigSubPms {
  if (!name) return false
  return (BRIG_SUB_PMS as readonly string[]).includes(name.toLowerCase().trim())
}

export interface NormalizedPmsSelection {
  /** pms_name canonico da salvare in pms_integrations.pms_name */
  pmsName: string
  /** se la selezione era un sub-PMS BRiG, il PMS reale; altrimenti null */
  brigSubPms: BrigSubPms | null
}

/**
 * Normalizza la selezione PMS fatta in fase di onboarding/configurazione
 * nella forma canonica usata dal sistema.
 *
 * - "slope" / "mews" / ... (sub-PMS BRiG)  →  { pmsName:"brig", brigSubPms:"slope" }
 * - "scidoo" / "brig" / "other" / ...      →  { pmsName:<invariato>, brigSubPms:null }
 */
export function normalizePmsSelection(rawName: string | null | undefined): NormalizedPmsSelection {
  const raw = (rawName ?? "").toLowerCase().trim()
  if (isBrigSubPms(raw)) {
    return { pmsName: "brig", brigSubPms: raw }
  }
  return { pmsName: rawName ?? "", brigSubPms: null }
}
