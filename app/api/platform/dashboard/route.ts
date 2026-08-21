/**
 * GET /api/platform/dashboard
 *
 * I numeri del cruscotto, calcolati per la struttura attiva e filtrati per i
 * permessi di chi chiede.
 *
 * Due regole che governano tutto il file:
 *
 * 1. I conteggi si chiedono al database come CONTEGGI (`head: true` +
 *    `count: "exact"`), mai scaricando le righe per contarle qui. Supabase
 *    restituisce al massimo 1000 righe per volta: contando in memoria, una
 *    casella con 7.682 conversazioni ne avrebbe dichiarate 1.000. E' un inganno
 *    in cui sono gia' caduto misurando questi stessi dati.
 *
 * 2. Un numero che non si e' potuto misurare vale `null`, NON zero. Se una query
 *    fallisce e il cruscotto scrive "0 non lette", il responsabile legge
 *    "casella tranquilla" mentre nessuno sa cosa stia succedendo: un guasto
 *    travestito da buona notizia. Con `null` la pagina dice "non misurabile".
 *
 * I pannelli riservati (ricavi, attivita' per persona, presenza, salute) sono
 * filtrati QUI, lato server: nasconderli solo nell'interfaccia lascerebbe i dati
 * raggiungibili a chiunque sappia chiamare l'indirizzo.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getMemberEffectiveAreas } from "@/lib/auth/area-access"
import { dashboardProfileLabel, visiblePanels } from "@/lib/platform/dashboard"
import { canaleIncluso, listAnalyticsSources } from "@/lib/platform/analytics-sources"

export const dynamic = "force-dynamic"

/** Un numero misurato, oppure `null` se la misura non e' riuscita. */
type Numero = number | null

/** Presenza: da quanto tempo un segnale conta ancora come "adesso". */
const PRESENZA_MINUTI = 5

/** Soglia oltre la quale una conversazione aperta e' considerata ferma. */
const FERMA_ORE = 24

/**
 * Finestra entro cui un arretrato e' ancora lavoro, non archivio.
 *
 * Ricavata dai dati veri, non scelta a gusto: sulla struttura di prova le
 * conversazioni aperte risalgono fino al 26/11/2024, e senza finestra
 * l'arretrato "da gestire" sarebbe 7315 voci — un numero su cui nessuno agisce.
 * A 7 giorni i conti diventano azionabili (65 non lette, 570 ferme) e coprono
 * comunque piu' di un cambio turno.
 */
const GIORNI_UTILI = 7

function isoOreFa(ore: number): string {
  return new Date(Date.now() - ore * 3600_000).toISOString()
}

export async function GET(request: NextRequest) {
  const identita = await getCallerIdentity(request)
  if (!identita) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }
  const propertyId = identita.propertyId
  if (!propertyId) {
    return NextResponse.json({ error: "Nessuna struttura selezionata" }, { status: 400 })
  }

  const isAdmin = identita.isSuperAdmin || identita.isTenantAdmin
  const sb = createServiceClient()

  // Moduli attivi della struttura: governano quali pannelli esistono affatto.
  // `null` (non solo elenco vuoto) quando la lettura non riesce, perche' i
  // pannelli sono fail-OPEN sui moduli: un guasto di rete non deve svuotare il
  // cruscotto facendo sembrare spenti moduli che sono accesi.
  let activeModules: string[] | null = null
  try {
    const { data, error } = await sb
      .from("tenant_modules")
      .select("module_key, status")
      .eq("property_id", propertyId)
    if (error) throw error
    activeModules = (data ?? [])
      .filter((m: { status: string | null }) => m.status === "active")
      .map((m: { module_key: string }) => m.module_key)
  } catch (e) {
    console.error("[v0] dashboard: moduli attivi non leggibili:", e)
    activeModules = null
  }

  // Aree del membro: servono per non restituire numeri di aree non concesse.
  let areas: string[] = []
  if (!isAdmin && identita.adminUserId) {
    try {
      // La firma e' (propertyId, adminUserId): invertirli non da' errore, ma
      // restituisce solo le aree baseline e il membro perde ogni pannello
      // concesso. Ordine verificato sulla definizione della funzione.
      areas = await getMemberEffectiveAreas(propertyId, identita.adminUserId)
    } catch {
      // Fail-closed: se non riusciamo a stabilire le aree, il membro riceve solo
      // cio' che e' baseline. Meglio un cruscotto povero che uno indebito.
      areas = []
    }
  }
  const haArea = (chiave: string) => isAdmin || areas.includes(chiave)

  /**
   * Esegue un conteggio isolando SEMPRE la struttura. Restituisce `null` in caso
   * di errore, cosi' il guasto resta visibile invece di sembrare uno zero.
   */
  async function conta(
    tabella: string,
    affina?: (q: any) => any,
  ): Promise<Numero> {
    try {
      let q = sb.from(tabella).select("*", { count: "exact", head: true }).eq("property_id", propertyId)
      if (affina) q = affina(q)
      const { count, error } = await q
      if (error) {
        console.error(`[v0] dashboard: conteggio ${tabella} fallito:`, error.message)
        return null
      }
      return count ?? null
    } catch (e) {
      console.error(`[v0] dashboard: conteggio ${tabella} eccezione:`, e)
      return null
    }
  }

  const dati: Record<string, unknown> = {}

  // ---- Casella condivisa (tutti quelli che hanno l'inbox) ----
  //
  // I conteggi sono limitati agli ultimi GIORNI_UTILI giorni. Non e' un dettaglio
  // estetico: misurato su Villa I Barronci, "non lette" senza finestra fa 1014 e
  // "ferme da oltre 24h" fa 7315, ma la conversazione aperta piu' vecchia risale
  // al 26/11/2024. Quei numeri sono in gran parte IMPORTAZIONE STORICA (le
  // caselle sono state collegate con tutto il pregresso), e su 7315 voci nessuno
  // puo' agire: un cruscotto che apre con un allarme non azionabile insegna a
  // ignorare l'allarme. Nella finestra utile gli stessi conti fanno 65 e 570.
  //
  // Il totale d'archivio non viene nascosto: viaggia a fianco come contesto
  // dichiarato, cosi' il numero grande resta verificabile e non sembra un conto
  // sparito.
  if (haArea("inbox")) {
    const daFinestra = isoOreFa(24 * GIORNI_UTILI)
    const fermaDa = isoOreFa(FERMA_ORE)
    const [nonLette, nonLetteArchivio, ferme, fermeArchivio, ultime24h] = await Promise.all([
      conta("conversations", (q) => q.gt("unread_count", 0).neq("status", "deleted").gte("last_message_at", daFinestra)),
      conta("conversations", (q) => q.gt("unread_count", 0).neq("status", "deleted")),
      conta("conversations", (q) =>
        q.eq("status", "open").gte("last_message_at", daFinestra).lt("last_message_at", fermaDa),
      ),
      conta("conversations", (q) => q.eq("status", "open")),
      conta("conversations", (q) => q.gte("last_message_at", isoOreFa(24))),
    ])
    dati.backlog = { nonLette, nonLetteArchivio, ultime24h, giorni: GIORNI_UTILI }
    dati.stale = { ferme, fermeArchivio, soglieOre: FERMA_ORE, giorni: GIORNI_UTILI }
  }

  // ---- Telefonate ----
  if (haArea("calls")) {
    const da7g = isoOreFa(24 * 7)
    const [totali, perse, entranti] = await Promise.all([
      conta("phone_calls", (q) => q.gte("started_at", da7g)),
      conta("phone_calls", (q) => q.gte("started_at", da7g).eq("status", "missed")),
      conta("phone_calls", (q) => q.gte("started_at", da7g).eq("direction", "inbound")),
    ])
    dati.calls = { totali, perse, entranti, giorni: 7 }
  }

  // ---- Attivita' aperte ----
  if (haArea("todos")) {
    const [aperte, totali] = await Promise.all([
      conta("todos", (q) => q.eq("status", "open")),
      conta("todos"),
    ])
    dati["my-todos"] = { aperte, totali }
  }

  // ---- Turni in arrivo e assenze ----
  //
  // La colonna e' `starts_at` (letta dal codice HR del progetto): `shift_date`
  // non esiste e il database rifiutava la query.
  //
  // Si conta il turno PUBBLICATO in arrivo sulla struttura, non "il mio":
  // `hr_shifts` lega il turno a `employee_id`, che non e' l'utente
  // amministrativo, e senza quel collegamento un conteggio personale sarebbe
  // inventato. Il dettaglio personale vive in /admin/my-work, dove la scheda
  // dipendente viene risolta davvero.
  const [turni, assenze] = await Promise.all([
    conta("hr_shifts", (q) => q.gte("starts_at", new Date().toISOString())),
    isAdmin || haArea("hr") ? conta("hr_leave_requests", (q) => q.eq("status", "pending")) : Promise.resolve(null),
  ])
  dati["my-shifts"] = { prossimi: turni }
  if (isAdmin || haArea("hr")) dati["leave-requests"] = { inAttesa: assenze }

  // ---- Tracking ----
  if (haArea("tracking")) {
    const [siti, giorniDomanda] = await Promise.all([
      conta("tracking_sites"),
      conta("demand_calendar_days"),
    ])
    dati.visitors = { siti, giorniDomanda }
  }

  // ---- Campagne ----
  if (haArea("marketing")) {
    dati.campaigns = { totali: await conta("email_campaigns") }
  }

  // ================= Riservato agli amministratori =================
  if (isAdmin) {
    // Chi e' al lavoro adesso. La finestra di freschezza e' indispensabile:
    // senza, un segnale di tre giorni fa comparirebbe come "presente".
    try {
      const { data: presenze, error } = await sb
        .from("operator_presence")
        .select("admin_user_id, last_seen_at")
        .eq("property_id", propertyId)
        .gte("last_seen_at", new Date(Date.now() - PRESENZA_MINUTI * 60_000).toISOString())
      if (error) throw error

      type Presenza = { admin_user_id: string; last_seen_at: string }
      const righe = (presenze ?? []) as Presenza[]

      const ids = righe.map((p) => p.admin_user_id).filter(Boolean)
      let nomi: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: utenti } = await sb.from("admin_users").select("id, name, email").in("id", ids)
        const elenco = (utenti ?? []) as { id: string; name: string | null; email: string }[]
        nomi = Object.fromEntries(elenco.map((u) => [u.id, u.name || u.email]))
      }
      dati.presence = {
        minuti: PRESENZA_MINUTI,
        persone: righe.map((p) => ({
          nome: nomi[p.admin_user_id] ?? "Operatore",
          ultimoSegnale: p.last_seen_at,
        })),
      }
    } catch (e) {
      console.error("[v0] dashboard: presenza non misurabile:", e)
      dati.presence = { minuti: PRESENZA_MINUTI, persone: null }
    }

    // Volumi per canale, limitati alle sorgenti scelte per le statistiche.
    //
    // Senza questo filtro l'email faceva 7.682: un numero vero come somma e
    // fuorviante come indicazione, perche' includeva due caselle di 4BID Srl
    // (l'agenzia) e la posta personale del titolare (6.806 conversazioni). Non
    // diceva quanto lavora l'hotel.
    //
    // Le due meta' del filtro non sono simmetriche, ed e' una misura non una
    // preferenza: le conversazioni email hanno tutte la casella collegata
    // (7.684 su 7.684), quelle di chat/WhatsApp/Telegram non ce l'hanno mai
    // (0 su 9). Per la messaggistica l'unico filtro possibile e' il tipo.
    const { filter: sorgenti } = await listAnalyticsSources(sb, propertyId)
    const caselle = sorgenti.emailChannelIds

    const perTipo = (tipo: string) => async (): Promise<Numero> => {
      if (!canaleIncluso(sorgenti, tipo)) return 0
      return conta("conversations", (q) => q.eq("channel", tipo))
    }

    const [email, chat, whatsapp, telegram] = await Promise.all([
      caselle !== null && caselle.length === 0
        ? Promise.resolve(0 as Numero)
        : conta("conversations", (q) => {
            const base = q.eq("channel", "email")
            return caselle === null ? base : base.in("channel_id", caselle)
          }),
      perTipo("chat")(),
      perTipo("whatsapp")(),
      perTipo("telegram")(),
    ])

    dati.volumes = {
      email,
      chat,
      whatsapp,
      telegram,
      // La card dichiara quante sorgenti sono state escluse: un totale piu'
      // basso senza spiegazione sembrerebbe un calo del lavoro.
      escluse: sorgenti.escluse,
      tutteIncluse: sorgenti.tutteIncluse,
      nessunaInclusa: sorgenti.nessunaInclusa,
    }

    // Attivita' per persona.
    //
    // Si contano le RISPOSTE SCRITTE (sender_type "agent"), non le conversazioni
    // assegnate: l'assegnazione non e' mai stata usata (0 su 7.682) e un
    // pannello costruito su quella colonna sarebbe stato vuoto.
    //
    // Le risposte senza autore vengono dichiarate. Oggi sono la maggioranza (51
    // su 54, per un difetto ora corretto a monte): mostrare solo "Filippo: 2"
    // farebbe credere che la squadra non abbia praticamente risposto.
    try {
      const da30g = isoOreFa(24 * 30)
      const { data: risposte, error } = await sb
        .from("messages")
        .select("sender_id, sender_name")
        .eq("property_id", propertyId)
        .eq("sender_type", "agent")
        .gte("created_at", da30g)
        .limit(5000)
      if (error) throw error

      const perAutore = new Map<string, { nome: string; risposte: number }>()
      let senzaAutore = 0
      for (const r of risposte ?? []) {
        if (!r.sender_id) {
          senzaAutore++
          continue
        }
        const voce = perAutore.get(r.sender_id) ?? { nome: r.sender_name || "Operatore", risposte: 0 }
        voce.risposte++
        if (r.sender_name) voce.nome = r.sender_name
        perAutore.set(r.sender_id, voce)
      }

      // I nomi mancanti si recuperano dall'anagrafica: "Operatore" ripetuto non
      // aiuta chi deve capire chi ha lavorato.
      const senzaNome = [...perAutore.entries()].filter(([, v]) => v.nome === "Operatore").map(([k]) => k)
      if (senzaNome.length > 0) {
        const { data: utenti } = await sb.from("admin_users").select("id, name, email").in("id", senzaNome)
        for (const u of utenti ?? []) {
          const voce = perAutore.get(u.id)
          if (voce) voce.nome = u.name || u.email
        }
      }

      const totale = (risposte ?? []).length
      dati["per-person"] = {
        giorni: 30,
        persone: [...perAutore.values()].sort((a, b) => b.risposte - a.risposte),
        attribuite: totale - senzaAutore,
        totali: totale,
      }
    } catch (e) {
      console.error("[v0] dashboard: attivita' per persona non misurabile:", e)
      dati["per-person"] = { giorni: 30, persone: null, attribuite: null, totali: null }
    }

    // Salute del sistema: caselle email collegate e moduli attivi.
    try {
      const { count: caselle, error: e1 } = await sb
        .from("email_channels")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId)
      // I moduli attivi sono gia' stati letti in cima al file per decidere quali
      // pannelli esistono: si riusa quel dato invece di interrogare due volte la
      // stessa tabella, che e' anche il modo in cui due numeri finiscono per non
      // coincidere. `null` resta `null`: se la lettura non e' riuscita, qui non
      // si scrive zero.
      const { count: moduliTotali, error: e2 } = await sb
        .from("tenant_modules")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId)
      if (e1 || e2) throw e1 ?? e2
      dati["system-health"] = {
        caselle: caselle ?? null,
        moduliAttivi: activeModules === null ? null : activeModules.length,
        moduliTotali: moduliTotali ?? null,
      }
    } catch (e) {
      console.error("[v0] dashboard: salute non misurabile:", e)
      dati["system-health"] = { caselle: null, moduliAttivi: null, moduliTotali: null }
    }

    // Domande senza risposta registrate dall'assistente.
    dati["knowledge-gaps"] = { aperte: await conta("knowledge_gaps", (q) => q.eq("status", "open")) }
  }

  // Quali pannelli sono visibili lo decide IL SERVER, con la stessa funzione che
  // conosce le regole. La pagina si limita a disegnare l'elenco ricevuto: se
  // ricalcolasse i permessi a modo suo nascerebbe la divergenza fra due fonti
  // che abbiamo appena finito di eliminare nel menu.
  const viewer = { isAdmin, areas, activeModules }
  const panels = visiblePanels(viewer).map((p) => p.id)

  return NextResponse.json({
    isAdmin,
    /*
     * Chi amministra la piattaforma, tenuto DISTINTO da `isAdmin`.
     *
     * `isAdmin` qui sopra e' `isSuperAdmin || isTenantAdmin`: giusto per i
     * pannelli di una struttura, sbagliato per decidere se mostrare la vista
     * d'insieme su tutti i clienti. Se il cruscotto si fidasse di `isAdmin`, un
     * albergatore vedrebbe il fatturato complessivo della piattaforma e
     * l'elenco dei concorrenti.
     *
     * Lo decide il server e non il browser: la pagina si limita a mostrare.
     */
    isPlatformAdmin: identita.isSuperAdmin === true,
    propertyId,
    profilo: dashboardProfileLabel(viewer),
    panels,
    dati,
  })
}
