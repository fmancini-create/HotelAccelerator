import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { gmailFetch } from "@/lib/gmail-client"
import { SENZA_CARTELLA, SENZA_CARTELLA_NOME } from "@/lib/inbox/folder-visibility"

/** Tetto di righe che PostgREST restituisce. Serve per accorgersi del taglio. */
const TETTO_RIGHE = 1000

/**
 * Cartelle di TUTTE le caselle email, con la scelta di visibilita' e quante
 * conversazioni dell'inbox arrivano da ciascuna.
 *
 * Il conteggio mostrato e' quello delle conversazioni PRESENTI NELL'INBOX, non
 * quello di Gmail: la decisione da prendere e' "mostrarla qui o no", quindi il
 * numero rilevante e' quanto sparirebbe da qui. Il totale di Gmail sarebbe un
 * numero piu' grande e non pertinente.
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    const supabase = access.supabase

    const { data: caselle, error: erroreCaselle } = await supabase
      .from("email_channels")
      .select("id, email_address, provider, is_active")
      .eq("property_id", propertyId)
      .order("email_address")

    if (erroreCaselle) {
      return NextResponse.json({ error: erroreCaselle.message }, { status: 400 })
    }

    // Solo le caselle che l'utente puo' vedere: un operatore con una casella
    // assegnata non deve poter spegnere cartelle di caselle altrui.
    const accessibili = []
    for (const casella of caselle || []) {
      if (await canAccessEmailChannel(access, propertyId, casella.id)) accessibili.push(casella)
    }

    if (accessibili.length === 0) {
      return NextResponse.json({ mailboxes: [] })
    }

    // Scelte salvate. Assente = visibile, quindi qui interessano solo le righe
    // esistenti e non serve una riga per ogni cartella.
    const { data: salvate } = await supabase
      .from("email_labels")
      .select("channel_id, gmail_id, visible_in_inbox")
      .eq("property_id", propertyId)

    const visibilita = new Map<string, boolean>()
    for (const riga of salvate || []) {
      visibilita.set(`${riga.channel_id}:${riga.gmail_id}`, riga.visible_in_inbox !== false)
    }

    // Conversazioni CON cartella registrata: sono poche (centinaia), quindi si
    // leggono in una volta e si contano qui. Il taglio a 1000 righe di PostgREST
    // viene rilevato invece di essere subito per buono, o un domani i conteggi
    // sarebbero sbagliati con l'aria di essere giusti.
    const { data: conEtichette } = await supabase
      .from("conversations")
      .select("channel_id, gmail_labels")
      .eq("property_id", propertyId)
      .eq("channel", "email")
      .not("gmail_labels", "is", null)
      .neq("gmail_labels", "{}")
      .limit(TETTO_RIGHE)

    const conteggiTagliati = (conEtichette?.length ?? 0) >= TETTO_RIGHE

    const conteggi = new Map<string, number>()
    for (const conv of conEtichette || []) {
      if (!conv.channel_id || !Array.isArray(conv.gmail_labels)) continue
      for (const etichetta of conv.gmail_labels) {
        const chiave = `${conv.channel_id}:${etichetta}`
        conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1)
      }
    }

    const mailboxes = await Promise.all(
      accessibili.map(async (casella) => {
        // Conversazioni SENZA cartella: sono migliaia, quindi si contano nel
        // database senza portarsi indietro le righe.
        const { count: senzaCartella } = await supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("channel", "email")
          .eq("channel_id", casella.id)
          .or("gmail_labels.is.null,gmail_labels.eq.{}")

        const chiaveSenza = `${casella.id}:${SENZA_CARTELLA}`
        const voceSenzaCartella = {
          id: SENZA_CARTELLA,
          name: SENZA_CARTELLA_NOME,
          type: "system" as const,
          visible: visibilita.get(chiaveSenza) ?? true,
          conversazioni: senzaCartella ?? 0,
          senzaCartella: true,
        }

        // I nomi delle cartelle esistono solo su Gmail: nel database si conserva
        // l'id (`Label_123`), che da solo non dice niente all'operatore.
        const { data: datiGmail, error: erroreGmail } = await gmailFetch(casella.id, "labels")

        if (erroreGmail || !datiGmail) {
          // Una casella che non risponde non deve far fallire le altre: si
          // dichiara il problema e si mostra comunque cio' che si sa.
          return {
            id: casella.id,
            email_address: casella.email_address,
            errore: typeof erroreGmail === "string" ? erroreGmail : "Cartelle non leggibili da Gmail",
            folders: [voceSenzaCartella],
            conteggiTagliati,
          }
        }

        const cartelle = (datiGmail.labels || [])
          .map((etichetta: any) => ({
            id: etichetta.id as string,
            name: (etichetta.name as string) || (etichetta.id as string),
            type: etichetta.type === "system" ? ("system" as const) : ("user" as const),
            visible: visibilita.get(`${casella.id}:${etichetta.id}`) ?? true,
            conversazioni: conteggi.get(`${casella.id}:${etichetta.id}`) ?? 0,
            senzaCartella: false,
          }))
          .sort((a: any, b: any) => {
            // Prima quelle che portano conversazioni: le cartelle a zero non
            // partecipano alla decisione e affollerebbero l'elenco.
            if (a.conversazioni !== b.conversazioni) return b.conversazioni - a.conversazioni
            return a.name.localeCompare(b.name)
          })

        return {
          id: casella.id,
          email_address: casella.email_address,
          folders: [voceSenzaCartella, ...cartelle],
          conteggiTagliati,
        }
      }),
    )

    return NextResponse.json({ mailboxes })
  } catch (error) {
    console.error("[v0] folders route error:", error)
    return NextResponse.json({ error: "Errore nel caricamento delle cartelle" }, { status: 500 })
  }
}
