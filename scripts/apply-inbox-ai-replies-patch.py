from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Read-model types: expose the durable conversation marker and AI message
# attribution to the UI. These are additive fields only.
# ---------------------------------------------------------------------------
replace_once(
    "lib/types/inbox-read.types.ts",
    "  unread_count: number\n\n  // Related entities - minimal fields",
    "  unread_count: number\n\n  // Durable marker: at least one AI-generated reply was actually sent.\n  ai_last_replied_at?: string | null\n  ai_last_message_id?: string | null\n  ai_last_virtual_user_name?: string | null\n\n  // Related entities - minimal fields",
)
replace_once(
    "lib/types/inbox-read.types.ts",
    "  sender_id: string | null\n  created_at: string\n  metadata: Record<string, unknown>\n  gmail_id?: string | null\n  gmail_internal_date?: string | null\n  received_at?: string | null\n  status?: \"received\" | \"read\" | \"replied\"",
    "  sender_id: string | null\n  sender_name?: string | null\n  created_at: string\n  stored_at?: string | null\n  content_type?: string | null\n  metadata: Record<string, unknown>\n  gmail_id?: string | null\n  gmail_internal_date?: string | null\n  received_at?: string | null\n  status?: \"received\" | \"read\" | \"replied\" | \"sent\" | \"draft\" | \"failed\"",
)
replace_once(
    "lib/types/inbox-read.types.ts",
    "  ids?: string[]\n  filter?: \"all\" | \"action_needed\" | \"high_priority\"",
    "  ids?: string[]\n  /** Only conversations where the AI actually sent at least one reply. */\n  ai_replied?: boolean\n  filter?: \"all\" | \"action_needed\" | \"high_priority\"",
)

# ---------------------------------------------------------------------------
# Repository: select/filter the indexed marker and preserve tenant scoping.
# ---------------------------------------------------------------------------
replace_once(
    "lib/platform-repositories/inbox-read.repository.ts",
    '    const { status = "open", channel, subchannel_id, limit = 50, offset = 0, search, mode = "smart", gmail_label, sort, access, ids } = options',
    '    const { status = "open", channel, subchannel_id, limit = 50, offset = 0, search, mode = "smart", gmail_label, sort, access, ids, ai_replied } = options',
)
replace_once(
    "lib/platform-repositories/inbox-read.repository.ts",
    "        unread_count,\n        booking_data,",
    "        unread_count,\n        ai_last_replied_at,\n        ai_last_message_id,\n        ai_last_virtual_user_name,\n        booking_data,",
)
replace_once(
    "lib/platform-repositories/inbox-read.repository.ts",
    "    // Apply ordering. Default:\n",
    "    // Smart folder: conversations where an AI reply was actually sent.\n    // This is ANDed with property_id and channel-access filters, so the marker\n    // never broadens tenant/user visibility.\n    if (ai_replied) {\n      query = query.not(\"ai_last_replied_at\", \"is\", null)\n    }\n\n    // Apply ordering. Default:\n",
)
# The detail query has a second unread_count occurrence. Target surrounding text.
replace_once(
    "lib/platform-repositories/inbox-read.repository.ts",
    "        property_id,\n        unread_count,\n        metadata,",
    "        property_id,\n        unread_count,\n        ai_last_replied_at,\n        ai_last_message_id,\n        ai_last_virtual_user_name,\n        metadata,",
)
replace_once(
    "lib/platform-repositories/inbox-read.repository.ts",
    '.select("id, content, sender_type, sender_id, created_at, metadata, gmail_id, received_at, status")',
    '.select("id, content, content_type, sender_type, sender_id, sender_name, created_at, stored_at, metadata, gmail_id, received_at, status")',
)

# ---------------------------------------------------------------------------
# API: parse a dedicated boolean. The AI folder intentionally spans statuses,
# so absent status becomes "all" only for this filter.
# ---------------------------------------------------------------------------
replace_once(
    "app/api/inbox/conversations/route.ts",
    "    const rawSort = searchParams.get(\"sort\") as InboxSort | null\n    const sort: InboxSort | undefined =\n      rawSort && ALLOWED_SORTS.includes(rawSort) ? rawSort : undefined\n",
    "    const rawSort = searchParams.get(\"sort\") as InboxSort | null\n    const sort: InboxSort | undefined =\n      rawSort && ALLOWED_SORTS.includes(rawSort) ? rawSort : undefined\n    const aiReplied = searchParams.get(\"ai_replied\") === \"true\"\n",
)
replace_once(
    "app/api/inbox/conversations/route.ts",
    '      status: (searchParams.get("status") as any) || "open",',
    '      status: aiReplied ? "all" : (searchParams.get("status") as any) || "open",',
)
replace_once(
    "app/api/inbox/conversations/route.ts",
    "      ids: searchParams.get(\"ids\")?.split(\",\").filter(Boolean) || undefined,\n      filter:",
    "      ids: searchParams.get(\"ids\")?.split(\",\").filter(Boolean) || undefined,\n      ai_replied: aiReplied || undefined,\n      filter:",
)

# ---------------------------------------------------------------------------
# Inbox UI: folder + conspicuous badges in list and detail.
# ---------------------------------------------------------------------------
replace_once(
    "app/admin/inbox/page.tsx",
    "  Zap,\n  Settings,",
    "  Zap,\n  Sparkles,\n  Settings,",
)
replace_once(
    "app/admin/inbox/page.tsx",
    "  unread_count: number\n  is_starred: boolean\n",
    "  unread_count: number\n  is_starred: boolean\n  ai_last_replied_at?: string | null\n  ai_last_message_id?: string | null\n  ai_last_virtual_user_name?: string | null\n",
)
replace_once(
    "app/admin/inbox/page.tsx",
    "  sender_id: string | null\n  content_type: string\n  created_at: string\n  received_at?: string\n  status?: \"received\" | \"read\" | \"replied\"\n  attachments: any[]",
    "  sender_id: string | null\n  sender_name?: string | null\n  content_type: string\n  created_at: string\n  stored_at?: string | null\n  received_at?: string\n  status?: \"received\" | \"read\" | \"replied\" | \"sent\" | \"draft\" | \"failed\"\n  metadata?: {\n    ai_generated?: boolean\n    ai_autopilot?: boolean\n    ai_draft?: boolean\n    ai_virtual_user_name?: string | null\n    ai_virtual_user_id?: string | null\n  } | null\n  attachments: any[]",
)
replace_once(
    "app/admin/inbox/page.tsx",
    '      if (statusFilter) queryParams.set("status", statusFilter)\n      // Unified inbox:',
    '      if (statusFilter === "ai-replied") queryParams.set("ai_replied", "true")\n      else if (statusFilter) queryParams.set("status", statusFilter)\n      // Unified inbox:',
)
replace_once(
    "app/admin/inbox/page.tsx",
    '                  { id: "open", label: "Da fare", icon: Inbox },\n                  { id: "pending", label: "Urgenti", icon: AlertCircle },',
    '                  { id: "open", label: "Da fare", icon: Inbox },\n                  { id: "ai-replied", label: "Risposte da IA", icon: Sparkles },\n                  { id: "pending", label: "Urgenti", icon: AlertCircle },',
)
replace_once(
    "app/admin/inbox/page.tsx",
    '                  <div className="flex items-center gap-2 mt-2">\n                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Posta in arrivo</span>\n                  </div>',
    '                  <div className="flex items-center gap-2 mt-2 flex-wrap">\n                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Posta in arrivo</span>\n                    {selectedConversation?.ai_last_replied_at && (\n                      <span\n                        className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800"\n                        title={`Ultima risposta IA: ${formatInboxTimestampFull(selectedConversation.ai_last_replied_at)}`}\n                      >\n                        <Sparkles className="h-3.5 w-3.5" />\n                        IA ha risposto{selectedConversation.ai_last_virtual_user_name ? ` · ${selectedConversation.ai_last_virtual_user_name}` : ""}\n                      </span>\n                    )}\n                  </div>',
)
replace_once(
    "app/admin/inbox/page.tsx",
    '                                  {message.sender_type === "agent" ? "Tu" : message.from?.name || message.from?.email?.split("@")[0]}\n                                </span>\n                                <span className="text-xs text-muted-foreground truncate">',
    '                                  {message.sender_type === "agent"\n                                    ? message.metadata?.ai_generated === true && message.status === "sent"\n                                      ? message.metadata?.ai_virtual_user_name || message.sender_name || "Assistente IA"\n                                      : message.sender_name || "Tu"\n                                    : message.from?.name || message.from?.email?.split("@")[0]}\n                                </span>\n                                {message.sender_type === "agent" && message.metadata?.ai_generated === true && message.status === "sent" && (\n                                  <span\n                                    className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800"\n                                    title="Messaggio generato e inviato automaticamente dall IA"\n                                  >\n                                    <Sparkles className="h-3 w-3" /> Risposta IA\n                                  </span>\n                                )}\n                                <span className="text-xs text-muted-foreground truncate">',
)
replace_once(
    "app/admin/inbox/page.tsx",
    "                        {conv.metadata?.staff_handoff && (\n",
    "                        {conv.ai_last_replied_at && (\n                          <span\n                            className=\"inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800\"\n                            title={`IA ha risposto${conv.ai_last_virtual_user_name ? ` come ${conv.ai_last_virtual_user_name}` : \"\"} · ${formatInboxTimestampFull(conv.ai_last_replied_at)}`}\n                          >\n                            <Sparkles className=\"h-3 w-3\" />\n                            Risposta IA\n                          </span>\n                        )}\n                        {conv.metadata?.staff_handoff && (\n",
)
replace_once(
    "app/admin/inbox/page.tsx",
    '                  <p className="text-sm">Nessun messaggio da gestire</p>',
    '                  <p className="text-sm">{statusFilter === "ai-replied" ? "Nessuna conversazione gestita dall IA" : "Nessun messaggio da gestire"}</p>',
)

print("Inbox AI replies patch applied successfully")
