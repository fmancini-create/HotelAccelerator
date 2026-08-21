import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { HandoffContact } from "./handoff-utils"

export type StaffHandoffChannel = "telegram" | "whatsapp" | "email" | "chat"

export type StaffHandoffStatus = "collecting" | "registered" | "cancelled"

export interface StaffHandoffState {
  id: string
  propertyId: string
  conversationId: string
  channel: StaffHandoffChannel
  status: StaffHandoffStatus
  originalQuestion: string
  contact: HandoffContact
  todoId: string | null
  manubotTaskId: string | null
}

type StaffHandoffRow = {
  id: string
  property_id: string
  conversation_id: string
  channel: StaffHandoffChannel
  status: StaffHandoffStatus
  original_question: string
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  todo_id: string | null
  manubot_task_id: string | null
}

const selectedColumns =
  "id, property_id, conversation_id, channel, status, original_question, contact_first_name, contact_last_name, contact_email, contact_phone, todo_id, manubot_task_id"

const toState = (row: StaffHandoffRow): StaffHandoffState => ({
  id: row.id,
  propertyId: row.property_id,
  conversationId: row.conversation_id,
  channel: row.channel,
  status: row.status,
  originalQuestion: row.original_question,
  contact: {
    firstName: row.contact_first_name,
    lastName: row.contact_last_name,
    email: row.contact_email,
    phone: row.contact_phone,
  },
  todoId: row.todo_id,
  manubotTaskId: row.manubot_task_id,
})

export async function getCollectingStaffHandoff(
  supabase: SupabaseClient,
  propertyId: string,
  conversationId: string,
): Promise<StaffHandoffState | null> {
  const { data, error } = await supabase
    .from("conversation_staff_handoffs")
    .select(selectedColumns)
    .eq("property_id", propertyId)
    .eq("conversation_id", conversationId)
    .eq("status", "collecting")
    .maybeSingle()

  if (error) throw new Error(`Lettura passaggio allo staff fallita: ${error.message}`)
  return data ? toState(data as StaffHandoffRow) : null
}

export async function startCollectingStaffHandoff(args: {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  channel: StaffHandoffChannel
  originalQuestion: string
  contact: HandoffContact
}): Promise<StaffHandoffState> {
  const existing = await getCollectingStaffHandoff(args.supabase, args.propertyId, args.conversationId)
  if (existing) return existing

  const now = new Date().toISOString()
  const { data, error } = await args.supabase
    .from("conversation_staff_handoffs")
    .insert({
      property_id: args.propertyId,
      conversation_id: args.conversationId,
      channel: args.channel,
      status: "collecting",
      original_question: args.originalQuestion.trim().slice(0, 1500),
      contact_first_name: args.contact.firstName?.trim() || null,
      contact_last_name: args.contact.lastName?.trim() || null,
      contact_email: args.contact.email?.trim() || null,
      contact_phone: args.contact.phone?.trim() || null,
      requested_at: now,
      created_at: now,
      updated_at: now,
    })
    .select(selectedColumns)
    .single()

  if (!error && data) return toState(data as StaffHandoffRow)

  // Two browser messages can arrive almost together. The unique tenant +
  // conversation key makes the second insert harmless; re-read the first row
  // rather than opening two tasks for the same guest.
  const raced = await getCollectingStaffHandoff(args.supabase, args.propertyId, args.conversationId)
  if (raced) return raced
  throw new Error(`Avvio passaggio allo staff fallito: ${error?.message ?? "nessun dato"}`)
}

export async function updateCollectingStaffHandoff(
  supabase: SupabaseClient,
  state: StaffHandoffState,
  contact: HandoffContact,
): Promise<StaffHandoffState> {
  const { data, error } = await supabase
    .from("conversation_staff_handoffs")
    .update({
      contact_first_name: contact.firstName?.trim() || null,
      contact_last_name: contact.lastName?.trim() || null,
      contact_email: contact.email?.trim() || null,
      contact_phone: contact.phone?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id)
    .eq("property_id", state.propertyId)
    .eq("conversation_id", state.conversationId)
    .eq("status", "collecting")
    .select(selectedColumns)
    .single()

  if (error || !data) throw new Error(`Aggiornamento passaggio allo staff fallito: ${error?.message ?? "nessun dato"}`)
  return toState(data as StaffHandoffRow)
}

export async function markStaffHandoffRegistered(
  supabase: SupabaseClient,
  state: StaffHandoffState,
  todoId: string | null | undefined,
  manubotTaskId: string | null | undefined,
): Promise<void> {
  const { error } = await supabase
    .from("conversation_staff_handoffs")
    .update({
      status: "registered",
      todo_id: todoId ?? null,
      manubot_task_id: manubotTaskId ?? null,
      registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id)
    .eq("property_id", state.propertyId)
    .eq("conversation_id", state.conversationId)
    .eq("status", "collecting")

  if (error) throw new Error(`Conferma passaggio allo staff fallita: ${error.message}`)
}

export async function cancelCollectingStaffHandoff(
  supabase: SupabaseClient,
  state: StaffHandoffState,
): Promise<void> {
  const { error } = await supabase
    .from("conversation_staff_handoffs")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", state.id)
    .eq("property_id", state.propertyId)
    .eq("conversation_id", state.conversationId)
    .eq("status", "collecting")

  if (error) throw new Error(`Annullamento passaggio allo staff fallito: ${error.message}`)
}
