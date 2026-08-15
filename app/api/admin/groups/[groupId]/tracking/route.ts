import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { TRACKING_PRESETS, isValidFieldKey, type TrackingField, type FieldType } from "@/lib/demand/fields"
import { MESSAGING_KINDS } from "@/lib/demand/scope"

const FIELD_TYPES: FieldType[] = ["text", "date", "number", "enum", "boolean"]

/**
 * I campi arrivano da un modulo, quindi da fuori: si ripuliscono qui.
 *
 * Una chiave malformata diventerebbe una chiave JSON nel payload salvato e una
 * riga di istruzioni per il modello: si scartano le chiavi non ammesse invece
 * di correggerle, perche' una chiave "corretta" da noi non sarebbe piu' quella
 * che l'amministratore ha scritto. Le doppie si scartano: due campi con la
 * stessa chiave si sovrascriverebbero a vicenda nel risultato.
 */
function normalizeFields(input: unknown): TrackingField[] {
  if (!Array.isArray(input)) return []
  const out: TrackingField[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const key = String((raw as TrackingField)?.key ?? "").trim().toLowerCase()
    if (!isValidFieldKey(key) || seen.has(key)) continue
    seen.add(key)
    const type = FIELD_TYPES.includes((raw as TrackingField)?.type) ? (raw as TrackingField).type : "text"
    const label = String((raw as TrackingField)?.label ?? "").trim() || key
    const hint = String((raw as TrackingField)?.hint ?? "").trim()
    const options = Array.isArray((raw as TrackingField)?.options)
      ? (raw as TrackingField).options!.map((o) => String(o).trim()).filter(Boolean)
      : undefined
    out.push({
      key,
      label,
      type,
      ...(type === "enum" && options?.length ? { options } : {}),
      ...(hint ? { hint } : {}),
    })
  }
  return out
}

/**
 * Cosa il cervello deve estrarre per un gruppo di lavoro.
 *
 * L'isolamento non si fida del `groupId` che arriva nell'indirizzo: si verifica
 * che quel gruppo appartenga alla struttura dell'amministratore autenticato,
 * come fanno le altre rotte dei gruppi. Senza quel controllo l'indirizzo di un
 * gruppo altrui aprirebbe la configurazione di un'altra struttura.
 */
async function assertGroupOfProperty(groupId: string, propertyId: string) {
  const supabase = createServiceClient()
  const { data: group } = await supabase
    .from("user_groups")
    .select("id, name")
    .eq("id", groupId)
    .eq("property_id", propertyId)
    .single()
  return group
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId } = await requireTenantAdmin(request)
    const group = await assertGroupOfProperty(groupId, propertyId)
    if (!group) return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })

    const supabase = createServiceClient()

    const { data: config } = await supabase
      .from("group_tracking_configs")
      .select("*")
      .eq("group_id", groupId)
      .maybeSingle()

    // Le caselle e i canali fra cui scegliere: si mostrano quelli della
    // struttura, non tutti quelli esistenti.
    const [{ data: mailboxes }, { data: messaging }] = await Promise.all([
      supabase
        .from("email_channels")
        .select("id, email_address, display_name")
        .eq("property_id", propertyId)
        .order("email_address"),
      supabase
        .from("messaging_channels")
        .select("id, channel_type, display_name")
        .eq("property_id", propertyId)
        .order("channel_type"),
    ])

    // I tipi di canale disponibili, non i singoli canali: sulla messaggistica
    // `conversations.channel_id` e' sempre nullo e gli identificativi scritti
    // in `metadata` puntano in parte a canali che non esistono piu', quindi il
    // perimetro si tiene per tipo (whatsapp, telegram, chat).
    const messagingKinds = Array.from(
      new Set((messaging ?? []).map((m: { channel_type: string }) => m.channel_type).filter(Boolean)),
    )

    let extractionCount = 0
    if (config) {
      const { count } = await supabase
        .from("conversation_extractions")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
      extractionCount = count ?? 0
    }

    return NextResponse.json({
      group,
      config: config ?? null,
      presets: TRACKING_PRESETS,
      mailboxes: mailboxes ?? [],
      messagingKinds,
      extractionCount,
    })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const { propertyId, userId } = await requireTenantAdmin(request)
    const group = await assertGroupOfProperty(groupId, propertyId)
    if (!group) return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })

    const supabase = createServiceClient()
    const body = await request.json()

    const fields: TrackingField[] = normalizeFields(body?.fields)
    if (body?.is_enabled && fields.length === 0) {
      return NextResponse.json(
        { error: "Per accendere il cervello serve almeno un campo da estrarre." },
        { status: 400 },
      )
    }

    const requestedEmailIds = Array.isArray(body?.sources?.email_channel_ids)
      ? body.sources.email_channel_ids.filter((id: unknown): id is string => typeof id === "string")
      : []
    const { data: allowedEmailRows } = requestedEmailIds.length
      ? await supabase.from("email_channels").select("id").eq("property_id", propertyId).in("id", requestedEmailIds)
      : { data: [] as Array<{ id: string }> }
    const allowedEmailIds = new Set((allowedEmailRows ?? []).map((row: { id: string }) => row.id))
    const sources = {
      email_channel_ids: Array.from(new Set(requestedEmailIds.filter((id: string) => allowedEmailIds.has(id)))),
      messaging_kinds: Array.isArray(body?.sources?.messaging_kinds)
        ? Array.from(new Set(body.sources.messaging_kinds.filter((kind: unknown) =>
            typeof kind === "string" && MESSAGING_KINDS.includes(kind as (typeof MESSAGING_KINDS)[number]),
          )))
        : [],
      include_phone: Boolean(body?.sources?.include_phone),
    }

    if (
      body?.is_enabled &&
      sources.email_channel_ids.length === 0 &&
      sources.messaging_kinds.length === 0 &&
      !sources.include_phone
    ) {
      return NextResponse.json(
        { error: "Per accendere il cervello serve almeno una sorgente da leggere." },
        { status: 400 },
      )
    }

    const { data: existing } = await supabase
      .from("group_tracking_configs")
      .select("id, fields, version")
      .eq("group_id", groupId)
      .maybeSingle()

    /**
     * La versione sale solo quando cambiano i CAMPI.
     *
     * La versione e' la chiave con cui si riconosce cio' che e' gia' stato
     * estratto: alzarla per una modifica qualunque (accendere l'interruttore,
     * aggiungere una casella) farebbe riesaminare da capo tutto l'archivio e
     * ripagare il modello per ottenere le stesse risposte. Cambiando i campi,
     * invece, la domanda posta e' un'altra e le vecchie risposte non valgono.
     */
    const fieldsChanged =
      !existing || JSON.stringify(existing.fields ?? []) !== JSON.stringify(fields)
    const version = existing ? (existing.version ?? 1) + (fieldsChanged ? 1 : 0) : 1

    const { data: saved, error } = await supabase
      .from("group_tracking_configs")
      .upsert(
        {
          property_id: propertyId,
          group_id: groupId,
          is_enabled: Boolean(body?.is_enabled),
          preset: typeof body?.preset === "string" ? body.preset : "libero",
          sources,
          fields,
          version,
          updated_at: new Date().toISOString(),
          updated_by: userId ?? null,
        },
        { onConflict: "group_id" },
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ config: saved, fieldsChanged })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
