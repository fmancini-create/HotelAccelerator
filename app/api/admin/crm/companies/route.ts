import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

/**
 * Aziende: aggregato dei contatti per il campo `contacts.company`.
 *
 * PERCHE' NON C'E' UNA TABELLA "aziende": non esiste in questo database, e
 * misurarlo e' stato il primo passo. Le tabelle presenti sono `contacts` e
 * `phone_calls`; di anagrafiche aziendali, trattative o attivita' commerciali
 * non c'e' traccia. La pagina che stava qui prima mostrava tre hotel inventati
 * ("Hotel Aurora", "Borgo Toscano", "Resort Panorama") con camere, referenti e
 * "valore potenziale" a piacere, dichiarando in fondo "Dati demo locali".
 *
 * L'unica sorgente VERA di un'azienda, oggi, e' il campo libero "Azienda" della
 * scheda contatto. Quindi si raggruppa quello, e null'altro: nessuna colonna
 * "categoria", "camere" o "owner", perche' quei dati non esistono da nessuna
 * parte e riempirli richiederebbe di inventarli una seconda volta.
 *
 * MISURATO AL MOMENTO DELLA SCRITTURA: 897 contatti nella struttura, di cui
 * ZERO con il campo azienda compilato. L'elenco nasce quindi vuoto, e lo
 * dichiara con i suoi numeri invece di simulare contenuto. Si popola da se'
 * appena qualcuno compila il campo: non serve tornare a mettere mano al codice.
 */

/** Pagina di lettura verso il database. */
const PAGINA = 1000

/**
 * Tetto di righe lette. Serve a non trasformare l'apertura della pagina in una
 * scansione senza fine se un domani i contatti diventassero centinaia di
 * migliaia. Quando scatta, la risposta lo DICHIARA (`troncato: true`): un
 * aggregato calcolato su una parte dei dati e presentato come totale sarebbe un
 * numero falso, ed e' esattamente l'errore che questa pagina esisteva per fare.
 */
const TETTO = 20000

interface RigaContatto {
  id: string
  company: string | null
  city: string | null
  total_bookings: number | null
  total_revenue_cents: number | null
  last_booking_date: string | null
}

export interface AziendaAggregata {
  /** Nome cosi' come e' scritto nella grafia piu' frequente fra i contatti. */
  nome: string
  contatti: number
  citta: string[]
  prenotazioni: number
  ricavo_cents: number
  /** Prenotazione piu' recente fra i contatti dell'azienda, se registrata. */
  ultima_prenotazione: string | null
}

export interface RispostaAziende {
  aziende: AziendaAggregata[]
  riepilogo: {
    /** Contatti totali della struttura. */
    contatti: number
    /** Contatti con il campo azienda compilato. */
    con_azienda: number
    /** Aziende distinte trovate. */
    aziende: number
    /** Righe effettivamente lette per l'aggregato. */
    lette: number
    troncato: boolean
  }
}

export async function GET(request: NextRequest) {
  try {
    // Stessa guardia delle altre rotte CRM: in "enforce" lancia, e il catch
    // finale la traduce in 403 invece di un 500 generico.
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Struttura non trovata." }, { status: 404 })
    }

    const supabase = createServiceClient()

    // I due conteggi servono ENTRAMBI, e su questo si regge l'onesta' della
    // pagina: "0 aziende" da solo suonerebbe come un guasto, mentre "0 aziende
    // su 897 contatti, nessuno col campo compilato" spiega da se' il perche'.
    const { count: contattiTotali, error: erroreTotale } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
    if (erroreTotale) throw erroreTotale

    const { count: conAzienda, error: erroreConAzienda } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .not("company", "is", null)
      .neq("company", "")
    if (erroreConAzienda) throw erroreConAzienda

    // Si leggono SOLO i contatti che hanno l'azienda: e' l'insieme da
    // raggruppare, e con il campo vuoto su tutti costa una richiesta a vuoto
    // invece di scorrere 897 righe inutilmente.
    const righe: RigaContatto[] = []
    let troncato = false

    if ((conAzienda ?? 0) > 0) {
      for (let inizio = 0; inizio < TETTO; inizio += PAGINA) {
        const fine = Math.min(inizio + PAGINA, TETTO) - 1
        const { data, error } = await supabase
          .from("contacts")
          .select("id, company, city, total_bookings, total_revenue_cents, last_booking_date")
          .eq("property_id", propertyId)
          .not("company", "is", null)
          .neq("company", "")
          // Ordine STABILE e univoco: `id` come ultima chiave. Ordinando solo
          // per un campo con valori ripetuti (e "company" ne ha per
          // definizione) la paginazione puo' restituire due volte la stessa
          // riga e saltarne un'altra, gonfiando o sgonfiando i conteggi.
          .order("company", { ascending: true })
          .order("id", { ascending: true })
          .range(inizio, fine)
        if (error) throw error

        const lotto = (data ?? []) as RigaContatto[]
        righe.push(...lotto)
        if (lotto.length < PAGINA) break
        if (inizio + PAGINA >= TETTO) troncato = true
      }
    }

    /**
     * Raggruppamento per nome normalizzato (minuscole, spazi compattati): senza
     * questo "Hotel Aurora", "hotel aurora" e "Hotel  Aurora " diventerebbero
     * tre aziende diverse. Il nome MOSTRATO resta la grafia piu' frequente fra
     * i contatti, non quella normalizzata, perche' e' quella che l'utente ha
     * scritto e riconosce.
     */
    const gruppi = new Map<
      string,
      {
        grafie: Map<string, number>
        contatti: number
        citta: Set<string>
        prenotazioni: number
        ricavo_cents: number
        ultima_prenotazione: string | null
      }
    >()

    for (const riga of righe) {
      const grezzo = (riga.company ?? "").trim()
      // Il campo puo' contenere soli spazi: PostgREST lo considera diverso da
      // "" e lo restituisce, ma come nome d'azienda non vale nulla.
      if (grezzo === "") continue
      const chiave = grezzo.toLocaleLowerCase("it-IT").replace(/\s+/g, " ")

      let g = gruppi.get(chiave)
      if (!g) {
        g = {
          grafie: new Map(),
          contatti: 0,
          citta: new Set(),
          prenotazioni: 0,
          ricavo_cents: 0,
          ultima_prenotazione: null,
        }
        gruppi.set(chiave, g)
      }

      g.grafie.set(grezzo, (g.grafie.get(grezzo) ?? 0) + 1)
      g.contatti += 1
      const citta = (riga.city ?? "").trim()
      if (citta !== "") g.citta.add(citta)
      g.prenotazioni += riga.total_bookings ?? 0
      g.ricavo_cents += riga.total_revenue_cents ?? 0
      if (riga.last_booking_date && (!g.ultima_prenotazione || riga.last_booking_date > g.ultima_prenotazione)) {
        g.ultima_prenotazione = riga.last_booking_date
      }
    }

    const aziende: AziendaAggregata[] = Array.from(gruppi.values())
      .map((g) => {
        const nome = Array.from(g.grafie.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it-IT"))[0][0]
        return {
          nome,
          contatti: g.contatti,
          citta: Array.from(g.citta).sort((a, b) => a.localeCompare(b, "it-IT")),
          prenotazioni: g.prenotazioni,
          ricavo_cents: g.ricavo_cents,
          ultima_prenotazione: g.ultima_prenotazione,
        }
      })
      .sort((a, b) => b.contatti - a.contatti || a.nome.localeCompare(b.nome, "it-IT"))

    const risposta: RispostaAziende = {
      aziende,
      riepilogo: {
        contatti: contattiTotali ?? 0,
        con_azienda: conAzienda ?? 0,
        aziende: aziende.length,
        lette: righe.length,
        troncato,
      },
    }

    return NextResponse.json(risposta)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const messaggio = error instanceof Error ? error.message : "Errore"
    const stato = messaggio.includes("autenticat") || messaggio.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: messaggio }, { status: stato })
  }
}
