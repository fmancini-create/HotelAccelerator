import { AdminHeader } from "@/components/admin/admin-header"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { createServiceClient } from "@/lib/supabase/server"
import {
  KnowledgeBasesManager,
  type KnowledgeBaseSummary,
} from "@/components/admin/knowledge/knowledge-bases-manager"
import type { ChannelRow } from "@/components/admin/knowledge/channel-bases-assignment"
import { KnowledgeGaps } from "@/components/admin/knowledge/knowledge-gaps"
import { Sparkles } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function KnowledgePage() {
  let propertyId: string | null = null
  try {
    propertyId = await getAuthenticatedPropertyId()
  } catch {
    propertyId = null
  }

  if (!propertyId) {
    return (
      <div className="min-h-full bg-muted">
        <AdminHeader title="Assistente IA" subtitle="Basi di conoscenza e comportamento dell'assistente" />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
          Sessione non valida. Effettua nuovamente l&apos;accesso.
        </div>
      </div>
    )
  }

  const bases = await getKnowledgeBases(propertyId)
  const initialBases: KnowledgeBaseSummary[] = bases.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    mode: b.mode,
    persona: b.persona,
    language: b.language,
    confidence_threshold: b.confidence_threshold,
    fallback_message: b.fallback_message,
    source_count: b.source_count,
  }))

  const supabase = createServiceClient()
  const { data } = await supabase
    .from("messaging_channels")
    .select("id, channel_type, display_name, is_active")
    .eq("property_id", propertyId)
    .order("channel_type", { ascending: true })

  type ChannelRecord = { id: string; channel_type: string; display_name: string | null; is_active: boolean }
  const channels = (data ?? []) as ChannelRecord[]
  const channelIds = channels.map((c) => c.id)
  const linksByChannel = new Map<string, { knowledge_base_id: string; position: number }[]>()
  if (channelIds.length > 0) {
    const { data: links } = await supabase
      .from("channel_knowledge_bases")
      .select("channel_id, knowledge_base_id, position")
      .in("channel_id", channelIds)
    for (const l of (links ?? []) as { channel_id: string; knowledge_base_id: string; position: number }[]) {
      const arr = linksByChannel.get(l.channel_id) ?? []
      arr.push({ knowledge_base_id: l.knowledge_base_id, position: l.position })
      linksByChannel.set(l.channel_id, arr)
    }
  }

  const initialChannels: ChannelRow[] = (channels ?? []).map((c) => ({
    id: c.id,
    channel_type: c.channel_type,
    display_name: c.display_name,
    is_active: c.is_active,
    baseIds: (linksByChannel.get(c.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((l) => l.knowledge_base_id),
  }))

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader
        title="Assistente IA"
        subtitle="Crea basi di conoscenza distinte e collegale ai singoli canali"
      />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-lg border border-ha-brand-soft bg-ha-brand-soft p-4 text-ha-brand-soft-foreground">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            Ogni base ha le proprie fonti e il proprio comportamento. Collega le basi ai canali (bot Telegram, numero
            WhatsApp, account email): un canale può usarne più di una, e la base <strong>primaria</strong> decide come
            l&apos;IA risponde.
          </p>
        </div>

        <KnowledgeBasesManager initialBases={initialBases} initialChannels={initialChannels} />

        {/*
          L'anello: le basi si impostano qui sopra, poi l'esperienza delle
          conversazioni le alimenta. Sta in questa pagina e non in una voce
          separata perche' approvare una risposta E' un modo di curare le basi.
          Compare solo se esiste almeno una base: senza basi non ci sono lacune
          da rivedere, e una scheda vuota sembrerebbe un guasto.
        */}
        {initialBases.length > 0 && (
          <KnowledgeGaps bases={initialBases.map((b) => ({ id: b.id, name: b.name }))} />
        )}
      </div>
    </div>
  )
}
