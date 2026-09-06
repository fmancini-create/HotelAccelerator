import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors"
import {
  leggiBlocchiAttivi,
  prendiBlocco,
  registraAttivita,
  rilasciaBlocco,
  type Bersaglio,
  type StatoBlocco,
  type Titolare,
} from "@/lib/inbox/collaboration"

const FINESTRA_DIGITAZIONE_MS = 7_000

interface RigaCoassegnazione {
  id: string
  property_id: string
  target_kind: Bersaglio["kind"]
  target_key: string
  holder_key: string
  user_id: string | null
  user_key: string
  user_label: string
  typing_at: string | null
  last_beat_at: string | null
}

export interface CollaboratoreVisibile {
  userId: string | null
  key: string
  label: string
  typing: boolean
  lastBeatAt: string | null
}

export interface BloccoCollaborativo extends StatoBlocco {
  collaborators: CollaboratoreVisibile[]
  typingLabels: string[]
}

export interface StatoCollaborazioneTarget {
  target: Bersaglio
  owner: Titolare | null
  collaborators: CollaboratoreVisibile[]
  typingLabels: string[]
  role: "free" | "holder" | "collaborator" | "viewer"
  canWrite: boolean
  canManage: boolean
}

function recente(value: string | null | undefined): boolean {
  if (!value) return false
  const ms = Date.now() - new Date(value).getTime()
  return Number.isFinite(ms) && ms >= 0 && ms <= FINESTRA_DIGITAZIONE_MS
}

function stessoBersaglio(a: Bersaglio, b: Bersaglio): boolean {
  return a.kind === b.kind && a.key === b.key
}

async function coassegnazioniValide(
  propertyId: string,
  target: Bersaglio,
  holderKey: string,
): Promise<RigaCoassegnazione[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_coassignments")
    .select(
      "id,property_id,target_kind,target_key,holder_key,user_id,user_key,user_label,typing_at,last_beat_at",
    )
    .eq("property_id", propertyId)
    .eq("target_kind", target.kind)
    .eq("target_key", target.key)
    .eq("holder_key", holderKey)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as RigaCoassegnazione[]
}

async function registraEventoEsteso(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  action: "coassignment_granted" | "coassignment_revoked" | "crm_stage_changed"
  details?: Record<string, unknown>
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from("conversation_activity_log").insert({
    property_id: params.propertyId,
    target_kind: params.target.kind,
    target_key: params.target.key,
    user_id: params.actor.adminUserId,
    user_key: params.actor.key,
    user_label: params.actor.label,
    action: params.action,
    details: params.details ?? {},
  })
  if (error) console.error("[inbox-collaboration] audit non scritto:", error.message)
}

export async function registraCambioStatoCrm(params: {
  propertyId: string
  conversationId: string
  actor: Titolare
  source: string
  from: string | null
  to: string | null
  recordId: string
}): Promise<void> {
  await registraEventoEsteso({
    propertyId: params.propertyId,
    target: { kind: "conversation", key: params.conversationId },
    actor: params.actor,
    action: "crm_stage_changed",
    details: {
      source: params.source,
      from: params.from,
      to: params.to,
      record_id: params.recordId,
    },
  })
}

export async function pulisciCoassegnazioniStale(params: {
  propertyId: string
  target: Bersaglio
  holderKey: string
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("conversation_coassignments")
    .delete()
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .neq("holder_key", params.holderKey)
  if (error) throw new Error(error.message)
}

export async function eCoassegnato(params: {
  propertyId: string
  target: Bersaglio
  holderKey: string
  actor: Titolare
}): Promise<boolean> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_coassignments")
    .select("id")
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.holderKey)
    .eq("user_key", params.actor.key)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/**
 * Mantiene vivo il lock di gruppo quando a lavorare e' un coassegnatario.
 * Il lock resta intestato al responsabile originario, ma l'attivita' di uno dei
 * collaboratori autorizzati impedisce che la conversazione venga presa da una
 * quarta persona mentre il gruppo sta ancora lavorando.
 */
export async function battitoCollaboratore(params: {
  propertyId: string
  target: Bersaglio
  holderKey: string
  actor: Titolare
  typing?: boolean
}): Promise<boolean> {
  const supabase = createServiceClient()
  const adesso = new Date().toISOString()
  const aggiornamenti: Record<string, string | null> = { last_beat_at: adesso }
  if (typeof params.typing === "boolean") aggiornamenti.typing_at = params.typing ? adesso : null

  const { data, error } = await supabase
    .from("conversation_coassignments")
    .update(aggiornamenti)
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.holderKey)
    .eq("user_key", params.actor.key)
    .select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) return false

  const { error: erroreLock } = await supabase
    .from("conversation_locks")
    .update({ last_beat_at: adesso })
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.holderKey)
  if (erroreLock) throw new Error(erroreLock.message)
  return true
}

export async function impostaDigitazioneTitolare(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  typing: boolean
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase
    .from("conversation_locks")
    .update({ typing_at: params.typing ? new Date().toISOString() : null })
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.actor.key)
  if (error) throw new Error(error.message)
}

export async function arricchisciBlocchiCollaborativi(
  propertyId: string,
  actor: Titolare,
): Promise<BloccoCollaborativo[]> {
  const blocchi = await leggiBlocchiAttivi(propertyId, actor)
  if (blocchi.length === 0) return []

  const supabase = createServiceClient()
  const [{ data: coassign, error: coError }, { data: lockRows, error: lockError }] = await Promise.all([
    supabase
      .from("conversation_coassignments")
      .select(
        "id,property_id,target_kind,target_key,holder_key,user_id,user_key,user_label,typing_at,last_beat_at",
      )
      .eq("property_id", propertyId),
    supabase
      .from("conversation_locks")
      .select("target_kind,target_key,holder_key,typing_at")
      .eq("property_id", propertyId),
  ])
  if (coError) throw new Error(coError.message)
  if (lockError) throw new Error(lockError.message)

  return blocchi.map((blocco) => {
    const righe = ((coassign ?? []) as RigaCoassegnazione[]).filter(
      (r) =>
        r.target_kind === blocco.bersaglio.kind &&
        r.target_key === blocco.bersaglio.key &&
        r.holder_key === blocco.titolare.key,
    )
    const collaborators = righe.map((r) => ({
      userId: r.user_id,
      key: r.user_key,
      label: r.user_label,
      typing: recente(r.typing_at),
      lastBeatAt: r.last_beat_at,
    }))
    const rawLock = (lockRows ?? []).find(
      (r: any) =>
        r.target_kind === blocco.bersaglio.kind &&
        r.target_key === blocco.bersaglio.key &&
        r.holder_key === blocco.titolare.key,
    ) as { typing_at?: string | null } | undefined
    const typingLabels = [
      ...(recente(rawLock?.typing_at) ? [blocco.titolare.label] : []),
      ...collaborators.filter((c) => c.typing).map((c) => c.label),
    ]
    return {
      ...blocco,
      mio: blocco.mio || collaborators.some((c) => c.key === actor.key),
      collaborators,
      typingLabels,
    }
  })
}

export async function statoCollaborazioneTarget(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  isAdmin: boolean
}): Promise<StatoCollaborazioneTarget> {
  const blocchi = await arricchisciBlocchiCollaborativi(params.propertyId, params.actor)
  const lock = blocchi.find((b) => stessoBersaglio(b.bersaglio, params.target)) ?? null
  if (!lock) {
    return {
      target: params.target,
      owner: null,
      collaborators: [],
      typingLabels: [],
      role: "free",
      canWrite: true,
      canManage: false,
    }
  }

  const collaborator = lock.collaborators.some((c) => c.key === params.actor.key)
  const holder = lock.titolare.key === params.actor.key
  return {
    target: params.target,
    owner: lock.titolare,
    collaborators: lock.collaborators,
    typingLabels: lock.typingLabels,
    role: holder ? "holder" : collaborator ? "collaborator" : "viewer",
    canWrite: holder || collaborator,
    canManage: holder || params.isAdmin,
  }
}

export async function utentiCoassegnabili(propertyId: string): Promise<Array<{ id: string; label: string; email: string }>> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("admin_users")
    .select("id,name,email")
    .eq("property_id", propertyId)
    .order("name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((u: any) => ({
    id: u.id as string,
    label: String(u.name || u.email || "Operatore"),
    email: String(u.email || ""),
  }))
}

export async function aggiungiCoassegnatario(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  isAdmin: boolean
  userId: string
}): Promise<void> {
  const blocchi = await leggiBlocchiAttivi(params.propertyId, params.actor)
  const lock = blocchi.find((b) => stessoBersaglio(b.bersaglio, params.target))
  if (!lock) throw new ConflictError("La conversazione non e' piu' in lavorazione.")
  if (lock.titolare.key !== params.actor.key && !params.isAdmin) {
    throw new ForbiddenError("Solo chi sta gestendo la conversazione puo' condividerla.")
  }

  const supabase = createServiceClient()
  const { data: user, error: userError } = await supabase
    .from("admin_users")
    .select("id,name,email,property_id")
    .eq("id", params.userId)
    .eq("property_id", params.propertyId)
    .maybeSingle()
  if (userError) throw new Error(userError.message)
  if (!user) throw new NotFoundError("Utente non trovato in questa struttura.")
  if (user.id === lock.titolare.adminUserId) return

  const label = String(user.name || user.email || "Operatore")
  const adesso = new Date().toISOString()
  const { error } = await supabase.from("conversation_coassignments").upsert(
    {
      property_id: params.propertyId,
      target_kind: params.target.kind,
      target_key: params.target.key,
      holder_key: lock.titolare.key,
      user_id: user.id,
      user_key: user.id,
      user_label: label,
      granted_by: params.actor.adminUserId,
      granted_by_key: params.actor.key,
      granted_by_label: params.actor.label,
      last_beat_at: adesso,
      updated_at: adesso,
    },
    { onConflict: "property_id,target_kind,target_key,user_key" },
  )
  if (error) throw new Error(error.message)

  await registraEventoEsteso({
    propertyId: params.propertyId,
    target: params.target,
    actor: params.actor,
    action: "coassignment_granted",
    details: { user_id: user.id, user_label: label, holder_key: lock.titolare.key },
  })
}

export async function rimuoviCoassegnatario(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  isAdmin: boolean
  userId: string
}): Promise<void> {
  const supabase = createServiceClient()
  const { data: row, error: rowError } = await supabase
    .from("conversation_coassignments")
    .select("id,user_id,user_key,user_label,holder_key")
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("user_id", params.userId)
    .maybeSingle()
  if (rowError) throw new Error(rowError.message)
  if (!row) return

  const selfRemoval = row.user_key === params.actor.key
  const { data: activeLocks } = await supabase
    .from("conversation_locks")
    .select("holder_key")
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .maybeSingle()
  const holder = activeLocks?.holder_key === params.actor.key
  if (!selfRemoval && !holder && !params.isAdmin) {
    throw new ForbiddenError("Non puoi modificare i collaboratori di questa conversazione.")
  }

  const { error } = await supabase
    .from("conversation_coassignments")
    .delete()
    .eq("id", row.id)
    .eq("property_id", params.propertyId)
  if (error) throw new Error(error.message)

  await registraEventoEsteso({
    propertyId: params.propertyId,
    target: params.target,
    actor: params.actor,
    action: "coassignment_revoked",
    details: { user_id: row.user_id, user_label: row.user_label, holder_key: row.holder_key },
  })
}

export interface AccessoScrittura {
  role: "holder" | "collaborator"
  holderKey: string
  holderLabel: string
}

/**
 * Guardia server-side: la UI sola non basta. Ogni invio tenta prima di prendere
 * il lock; se lo possiede un altro operatore l'invio passa esclusivamente se la
 * coassegnazione e' ancora legata a QUEL titolare attivo.
 */
export async function assicuraAccessoScrittura(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
}): Promise<AccessoScrittura> {
  const esito = await prendiBlocco({
    propertyId: params.propertyId,
    bersaglio: params.target,
    titolare: params.actor,
  })

  if (esito.esito !== "occupato") {
    await pulisciCoassegnazioniStale({
      propertyId: params.propertyId,
      target: params.target,
      holderKey: params.actor.key,
    })
    return { role: "holder", holderKey: params.actor.key, holderLabel: params.actor.label }
  }

  const allowed = await battitoCollaboratore({
    propertyId: params.propertyId,
    target: params.target,
    holderKey: esito.blocco.titolare.key,
    actor: params.actor,
  })
  if (!allowed) {
    throw new ConflictError(
      `Conversazione in gestione da ${esito.blocco.titolare.label}. Puoi leggerla, ma per rispondere serve la condivisione.`,
    )
  }

  return {
    role: "collaborator",
    holderKey: esito.blocco.titolare.key,
    holderLabel: esito.blocco.titolare.label,
  }
}

/** Chiude il lavoro dopo un invio riuscito anche quando ha spedito un
 * coassegnatario. La condizione sull'holder evita di liberare un lock nuovo in
 * caso di una rarissima corsa con la scadenza. */
export async function concludiLavorazioneDopoInvio(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
  holderKey: string
}): Promise<void> {
  const supabase = createServiceClient()
  const { data: deleted, error } = await supabase
    .from("conversation_locks")
    .delete()
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.holderKey)
    .select("id")
  if (error) throw new Error(error.message)

  const { error: coError } = await supabase
    .from("conversation_coassignments")
    .delete()
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("holder_key", params.holderKey)
  if (coError) throw new Error(coError.message)

  if (deleted?.length) {
    await registraAttivita({
      propertyId: params.propertyId,
      bersaglio: params.target,
      titolare: params.actor,
      azione: "lock_released",
      dettagli: { completed_by: params.actor.key, holder_key: params.holderKey },
    })
  }
}

/** Rilascio dalla UI. Il titolare libera tutto; un collaboratore che chiude la
 * propria scheda smette solo di risultare in digitazione e conserva il permesso
 * finche' il titolare non conclude o rilascia la conversazione. */
export async function rilasciaAccessoCollaborativo(params: {
  propertyId: string
  target: Bersaglio
  actor: Titolare
}): Promise<{ released: boolean; collaborator: boolean }> {
  const released = await rilasciaBlocco({
    propertyId: params.propertyId,
    bersaglio: params.target,
    titolare: params.actor,
  })
  const supabase = createServiceClient()
  if (released) {
    const { error } = await supabase
      .from("conversation_coassignments")
      .delete()
      .eq("property_id", params.propertyId)
      .eq("target_kind", params.target.kind)
      .eq("target_key", params.target.key)
    if (error) throw new Error(error.message)
    return { released: true, collaborator: false }
  }

  const { data, error } = await supabase
    .from("conversation_coassignments")
    .update({ typing_at: null, last_beat_at: new Date().toISOString() })
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.target.kind)
    .eq("target_key", params.target.key)
    .eq("user_key", params.actor.key)
    .select("id")
  if (error) throw new Error(error.message)
  return { released: false, collaborator: Boolean(data?.length) }
}
