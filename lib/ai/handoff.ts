import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getManubotClient } from "@/lib/manubot"
import { contactFullName, type HandoffContact } from "./handoff-utils"

export { contactFullName, contactIsComplete } from "./handoff-utils"
export type { HandoffContact } from "./handoff-utils"

/**
 * Staff handoff: turning "la metto in contatto con lo staff" into something real.
 *
 * Until now that sentence was a promise with nothing behind it — no task, no
 * flag, no notification — so the guest waited for a reply nobody knew about.
 * A handoff leaves two durable traces:
 *   1. a ManuBot task (via the existing todos -> ManuBot push), so the request
 *      enters the workflow the staff already uses;
 *   2. a marker on the conversation, so it stands out in the inbox list.
 *
 * The caller must only keep the promise when `registered` is true.
 */

export interface RegisterHandoffArgs {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  /** Channel the guest is writing from, shown to the operator. */
  channel: string
  contact: HandoffContact
  /** What the guest actually asked, so the operator can act without digging. */
  question: string
}

export interface RegisterHandoffResult {
  /** True when at least one durable trace exists. Only then may we promise. */
  registered: boolean
  /** True when a handoff for this conversation was already pending. */
  alreadyOpen: boolean
  todoId?: string
  manubotTaskId?: string
  /** Non-fatal failures, for logging and for the message metadata. */
  errors: string[]
}

const clean = (v?: string | null): string | null => {
  const t = v?.trim()
  return t ? t : null
}

export async function registerStaffHandoff(args: RegisterHandoffArgs): Promise<RegisterHandoffResult> {
  const { supabase, propertyId, conversationId, channel, contact, question } = args
  const errors: string[] = []
  const name = contactFullName(contact)

  // Do not pile up a new task every time the guest says "sì grazie" again:
  // one pending handoff per conversation is enough.
  const { data: existing } = await supabase
    .from("todos")
    .select("id, external_id")
    .eq("property_id", propertyId)
    .in("status", ["open", "in_progress"])
    .filter("external_data->>conversation_id", "eq", conversationId)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return {
      registered: true,
      alreadyOpen: true,
      todoId: existing.id,
      manubotTaskId: existing.external_id ?? undefined,
      errors,
    }
  }

  const channelLabel = channel === "telegram" ? "Telegram" : channel === "whatsapp" ? "WhatsApp" : channel
  const title = `Richiesta ospite da ${channelLabel}${name ? ` — ${name}` : ""}`
  const description = [
    "Richiesta raccolta dall'assistente AI: l'ospite ha chiesto di essere contattato dallo staff.",
    "",
    `Nome: ${name ?? "(non fornito)"}`,
    `Email: ${clean(contact.email) ?? "(non fornita)"}`,
    `Telefono: ${clean(contact.phone) ?? "(non fornito)"}`,
    `Canale: ${channelLabel}`,
    "",
    "Richiesta dell'ospite:",
    question.trim().slice(0, 1500) || "(nessun testo)",
  ].join("\n")

  // The local todo is the source of truth: it is created first, so the request
  // is never lost even if ManuBot is unreachable.
  const { data: todo, error: todoError } = await supabase
    .from("todos")
    .insert({
      property_id: propertyId,
      title,
      description,
      priority: "high",
      status: "open",
      tags: ["ai", "ospite", channelLabel.toLowerCase()],
      external_data: {
        conversation_id: conversationId,
        channel,
        contact: {
          first_name: clean(contact.firstName),
          last_name: clean(contact.lastName),
          email: clean(contact.email),
          phone: clean(contact.phone),
        },
      },
    })
    .select("id")
    .single()

  if (todoError) {
    // Never silent: a failed insert here is exactly what made the old promise
    // empty, so it must be visible in the logs.
    errors.push(`todo_insert: ${todoError.message}`)
  }

  // Push to ManuBot so the request lands in the staff workflow. Non-fatal: the
  // todo already exists locally.
  let manubotTaskId: string | undefined
  if (todo?.id) {
    try {
      const { data: property } = await supabase
        .from("properties")
        .select("manubot_email, manubot_password, manubot_supabase_url, manubot_company_id")
        .eq("id", propertyId)
        .single()

      if (property) {
        const client = await getManubotClient(property)
        const task = await client.createTask({
          title,
          description,
          priority: "high",
        })
        manubotTaskId = task.id
        await supabase
          .from("todos")
          .update({
            external_source: "manubot",
            external_id: task.id,
            external_url: `https://manubot.it/tasks/${task.id}`,
            external_data: {
              conversation_id: conversationId,
              channel,
              manubot_task_id: task.id,
              company_id: property.manubot_company_id ?? null,
              contact: {
                first_name: clean(contact.firstName),
                last_name: clean(contact.lastName),
                email: clean(contact.email),
                phone: clean(contact.phone),
              },
            },
          })
          .eq("id", todo.id)
      }
    } catch (err) {
      errors.push(`manubot_push: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Inbox evidence: star the conversation and record the handoff in metadata so
  // the list can show a badge. Merged read-then-write to preserve other keys
  // (messaging_channel_id lives here and drives channel access filtering).
  let conversationFlagged = false
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("property_id", propertyId)
    .maybeSingle()

  const { error: convError } = await supabase
    .from("conversations")
    .update({
      is_starred: true,
      metadata: {
        ...((conv?.metadata as Record<string, unknown>) ?? {}),
        staff_handoff: {
          requested_at: new Date().toISOString(),
          contact: {
            name,
            email: clean(contact.email),
            phone: clean(contact.phone),
          },
          todo_id: todo?.id ?? null,
          manubot_task_id: manubotTaskId ?? null,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("property_id", propertyId)

  if (convError) {
    errors.push(`conversation_flag: ${convError.message}`)
  } else {
    conversationFlagged = true
  }

  const registered = Boolean(todo?.id) || conversationFlagged
  if (errors.length > 0) {
    console.log(`[v0] handoff registered=${registered} errors=${errors.join(" | ")}`)
  }

  return { registered, alreadyOpen: false, todoId: todo?.id, manubotTaskId, errors }
}
