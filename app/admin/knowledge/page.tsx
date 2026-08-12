import { AdminHeader } from "@/components/admin/admin-header"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAiSettings } from "@/lib/ai/settings"
import { createServiceClient } from "@/lib/supabase/server"
import { AiSettingsCard, type AiSettings } from "@/components/admin/knowledge/ai-settings-card"
import { KnowledgeSources } from "@/components/admin/knowledge/knowledge-sources"
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
        <AdminHeader title="Assistente IA" subtitle="Base di conoscenza e comportamento dell'assistente" />
        <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
          Sessione non valida. Effettua nuovamente l&apos;accesso.
        </div>
      </div>
    )
  }

  const settings = await getAiSettings(propertyId)
  const supabase = createServiceClient()
  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, type, title, url, file_url, status, error, chunk_count, last_indexed_at, created_at, updated_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })

  const initialSettings: AiSettings = {
    mode: settings.mode,
    channels: settings.channels,
    persona: settings.persona,
    language: settings.language,
    confidence_threshold: settings.confidence_threshold,
    fallback_message: settings.fallback_message,
  }

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader
        title="Assistente IA"
        subtitle="Alimenta l'IA da più fonti e scegli come deve rispondere ai clienti"
      />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-lg border border-ha-brand-soft bg-ha-brand-soft p-4 text-ha-brand-soft-foreground">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            L&apos;assistente usa <strong>solo</strong> le informazioni che aggiungi qui sotto per rispondere su
            Telegram, WhatsApp ed Email. Più fonti aggiungi, più risposte accurate potrà dare.
          </p>
        </div>

        <AiSettingsCard initial={initialSettings} />
        <KnowledgeSources initial={sources ?? []} />
      </div>
    </div>
  )
}
