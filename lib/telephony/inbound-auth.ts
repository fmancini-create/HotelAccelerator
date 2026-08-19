import "server-only"
import { timingSafeEqual, createHash } from "crypto"
import type { NextRequest } from "next/server"
import { loadTelephonyRow, inboundSecretOf, type TelephonyRow } from "@/lib/telephony/config"

/**
 * Controllo d'accesso per gli endpoint chiamati DA 3CX (ricerca contatto e
 * registro chiamate).
 *
 * Un cervello, due chiamanti: prima ogni rotta aveva la propria copia del
 * confronto del segreto. Due copie divergono, e a divergere in silenzio sarebbe
 * stato il controllo di sicurezza.
 *
 * Il segreto arriva in due modi, entrambi accettati:
 *  - `?token=` nella query, come nella prima versione;
 *  - intestazione Basic, con il segreto come nome utente. E' il modo usato dai
 *    template CRM di 3CX (`<Authentication Type="Basic">`), e permette di NON
 *    scrivere il segreto dentro il file del template: l'operatore lo incolla
 *    nel campo "API Key" della console.
 */

export type InboundAuthResult =
  | { ok: true; row: TelephonyRow; propertyId: string }
  | { ok: false; status: 401 | 403 | 500 }

function constantTimeEquals(provided: string, expected: string): boolean {
  // Le lunghezze diverse escono subito: `timingSafeEqual` lancerebbe. Per non
  // reintrodurre una differenza di tempo misurabile confronto le impronte, che
  // hanno sempre la stessa lunghezza.
  const a = createHash("sha256").update(provided).digest()
  const b = createHash("sha256").update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Estrae il segreto presentato da 3CX: query oppure utente dell'intestazione Basic. */
function presentedToken(request: NextRequest): string {
  const fromQuery = new URL(request.url).searchParams.get("token")?.trim()
  if (fromQuery) return fromQuery

  const header = request.headers.get("authorization") || ""
  if (!header.toLowerCase().startsWith("basic ")) return ""
  try {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8")
    // Formato `segreto:X` (il template scrive `[APIkey]:X`): tengo la parte
    // prima dei due punti. `split` con limite non basta, il segreto stesso
    // potrebbe contenere due punti: taglio all'ULTIMO separatore.
    const cut = decoded.lastIndexOf(":")
    return (cut === -1 ? decoded : decoded.slice(0, cut)).trim()
  } catch {
    return ""
  }
}

export async function authenticateInbound(request: NextRequest): Promise<InboundAuthResult> {
  const propertyId = new URL(request.url).searchParams.get("property")?.trim() || ""
  const token = presentedToken(request)
  if (!propertyId || !token) return { ok: false, status: 401 }

  let row: TelephonyRow | null
  try {
    row = await loadTelephonyRow(propertyId)
  } catch {
    return { ok: false, status: 500 }
  }

  const expected = inboundSecretOf(row)
  if (!row || !expected || !constantTimeEquals(token, expected)) return { ok: false, status: 401 }

  // Canale spento dalla scheda /admin/channels. Il controllo sta DOPO la
  // verifica del segreto: prima, si potrebbe sondare dall'esterno quali
  // strutture hanno il centralino disattivato.
  if (!row.is_active) return { ok: false, status: 403 }

  return { ok: true, row, propertyId }
}

/**
 * Chiave di deduplicazione sintetica.
 *
 * Misurato sulla documentazione: il template CRM di 3CX NON espone alcun
 * identificativo di chiamata (nel set di variabili non esiste un [CallID]; per
 * averlo servirebbero i file CDR). Quindi `external_call_id` sarebbe sempre
 * vuoto e la protezione dai doppioni non sarebbe mai entrata in funzione: a
 * ogni ripetizione della richiesta la stessa telefonata comparirebbe due volte
 * nel registro.
 *
 * Ricostruisco quindi una chiave dai dati che 3CX manda davvero. Deve essere
 * deterministica, perche' una ripetizione deve produrre la stessa chiave.
 */
export function syntheticCallId(parts: {
  number: string
  extension: string
  startedAt: string
  direction: string
}): string {
  const basis = [
    parts.number.replace(/\D/g, ""),
    parts.extension.trim(),
    // Al secondo: e' l'istante di inizio comunicato dal centralino, identico
    // fra due invii della stessa chiamata.
    parts.startedAt.trim(),
    parts.direction,
  ].join("|")
  return "syn:" + createHash("sha256").update(basis).digest("hex").slice(0, 32)
}
