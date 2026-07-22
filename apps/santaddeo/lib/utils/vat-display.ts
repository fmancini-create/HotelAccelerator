/**
 * Visualizzazione importi con/senza IVA per tenant.
 *
 * REGOLA "dati certi": tutti i valori monetari sono memorizzati LORDI (IVA
 * inclusa). Lo scorporo a netto è una trasformazione di SOLA visualizzazione,
 * mai una scrittura sui dati.
 *
 * - I KPI Revenue/ADR/RevPAR/RevPOR/diretto/intermediato sono già "solo camera"
 *   (extra esclusi, fix 01/06/2026) → l'aliquota alloggio (default 10%) è
 *   l'aliquota CERTA per scorporarli: netto = lordo / (1 + aliquota/100).
 * - La Produzione Fiscale mischia reparti a IVA diversa: NON usare questa
 *   aliquota, ma l'IVA reale per riga dai documenti grezzi (gestita altrove).
 */

export type VatMode = "included" | "excluded"

export interface VatDisplayConfig {
  mode: VatMode
  /** Aliquota IVA alloggio in percentuale (es. 10 = 10%). */
  accommodationRate: number
}

export const DEFAULT_VAT_CONFIG: VatDisplayConfig = {
  mode: "included",
  accommodationRate: 10,
}

/** Normalizza i due campi grezzi letti da `hotels` in una config sicura. */
export function toVatConfig(
  revenueVatMode: unknown,
  accommodationVatRate: unknown,
): VatDisplayConfig {
  const mode: VatMode = revenueVatMode === "excluded" ? "excluded" : "included"
  const rate = Number(accommodationVatRate)
  const accommodationRate = Number.isFinite(rate) && rate >= 0 && rate < 100 ? rate : 10
  return { mode, accommodationRate }
}

/** Scorpora l'IVA da un importo lordo con l'aliquota indicata (percentuale). */
export function netFromGross(gross: number, ratePct: number): number {
  if (!Number.isFinite(gross)) return gross
  const r = Number(ratePct)
  if (!Number.isFinite(r) || r <= 0) return gross
  return gross / (1 + r / 100)
}

/**
 * Inverso di netFromGross: ri-applica l'IVA a un importo netto per ottenere il
 * lordo. Usato in SCRITTURA quando l'utente edita un valore in vista Netto ma
 * lo storage è canonicamente LORDO (es. obiettivi di budget).
 */
export function grossFromNet(net: number, ratePct: number): number {
  if (!Number.isFinite(net)) return net
  const r = Number(ratePct)
  if (!Number.isFinite(r) || r <= 0) return net
  return net * (1 + r / 100)
}

/**
 * Applica la modalità IVA a un singolo importo room-based.
 * Ritorna il netto se mode === 'excluded', altrimenti l'importo invariato.
 */
export function applyVatToAmount(gross: number | null | undefined, cfg: VatDisplayConfig): number | null | undefined {
  if (gross === null || gross === undefined) return gross
  if (cfg.mode !== "excluded") return gross
  return netFromGross(Number(gross), cfg.accommodationRate)
}

/**
 * Scorpora in blocco un set di campi monetari room-based di un oggetto.
 * Lineare nella revenue → vale anche per adr/revpar/revpor. Muta una copia.
 */
export function applyVatToRoomKpis<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
  cfg: VatDisplayConfig,
): T {
  if (cfg.mode !== "excluded") return obj
  const out: T = { ...obj }
  for (const f of fields) {
    const v = out[f]
    if (typeof v === "number" && Number.isFinite(v)) {
      out[f] = netFromGross(v, cfg.accommodationRate) as T[keyof T]
    }
  }
  return out
}

/**
 * Override di SOLA VISUALIZZAZIONE scelto dall'utente nelle pagine KPI.
 * - "gross"  → forza IVA inclusa (lordo)
 * - "net"    → forza IVA esclusa (netto)
 * - null     → nessun override, si usa il default della struttura
 *
 * NB: non scrive nulla sul tenant; cambia solo come l'utente vede i numeri.
 */
export type VatView = "gross" | "net"

/** Estrae il parametro `vatView` da una query string (URLSearchParams). */
export function parseVatViewParam(params: URLSearchParams | null | undefined): VatView | null {
  const raw = params?.get("vatView")
  if (raw === "gross" || raw === "net") return raw
  return null
}

/**
 * Combina la config certa del tenant con l'eventuale override di vista.
 * L'aliquota resta SEMPRE quella certa del tenant: l'override tocca solo
 * la `mode` (included/excluded), perché lo scorporo è sola visualizzazione.
 */
export function resolveVatConfig(tenant: VatDisplayConfig, view: VatView | null): VatDisplayConfig {
  if (!view) return tenant
  return { ...tenant, mode: view === "net" ? "excluded" : "included" }
}

/**
 * Legge la configurazione IVA di un hotel da Supabase.
 * Default sicuri (included, 10%) se i campi sono null o l'hotel non è trovato.
 */
export async function getHotelVatConfig(client: any, hotelId: string): Promise<VatDisplayConfig> {
  try {
    const { data } = await client
      .from("hotels")
      .select("revenue_vat_mode, accommodation_vat_rate")
      .eq("id", hotelId)
      .maybeSingle()
    if (!data) return { ...DEFAULT_VAT_CONFIG }
    return toVatConfig(data.revenue_vat_mode, data.accommodation_vat_rate)
  } catch {
    return { ...DEFAULT_VAT_CONFIG }
  }
}

/**
 * Scorpora in profondità un payload JSON: scala SOLO le chiavi monetarie
 * indicate (room-based) con l'aliquota alloggio, in modalità "excluded".
 * Lo scorporo è lineare: gli indicatori derivati (ADR/RevPAR) e gli YoY
 * (rapporti) restano coerenti. Non muta l'input.
 */
export function scorporoMonetaryDeep<T>(value: T, keys: string[], cfg: VatDisplayConfig): T {
  if (cfg.mode !== "excluded") return value
  const keySet = new Set(keys)
  const walk = (v: any): any => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === "object") {
      const out: any = {}
      for (const [k, val] of Object.entries(v)) {
        if (keySet.has(k) && typeof val === "number" && Number.isFinite(val)) {
          out[k] = netFromGross(val, cfg.accommodationRate)
        } else {
          out[k] = walk(val)
        }
      }
      return out
    }
    return v
  }
  return walk(value)
}

/** Etichetta UI breve, es. "IVA inclusa" / "IVA esclusa (10%)". */
export function vatModeLabel(cfg: VatDisplayConfig): string {
  if (cfg.mode === "excluded") {
    const r = Number(cfg.accommodationRate)
    const rateStr = Number.isInteger(r) ? String(r) : r.toFixed(1)
    return `IVA esclusa (${rateStr}%)`
  }
  return "IVA inclusa"
}
