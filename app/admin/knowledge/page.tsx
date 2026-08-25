import { AdminHeader } from "@/components/admin/admin-header"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getKnowledgeBases, getKnowledgeChannels } from "@/lib/ai/knowledge-bases"
import {
  KnowledgeBasesManager,
  type KnowledgeBaseSummary,
} from "@/components/admin/knowledge/knowledge-bases-manager"
import { KnowledgeGaps } from "@/components/admin/knowledge/knowledge-gaps"
import { InternalKnowledgeSyncStatusCard } from "@/components/admin/knowledge/internal-knowledge-sync-status"
import { getInternalKnowledgeSyncDiagnostics } from "@/lib/ai/internal-knowledge-sync-status"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
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

  const initialChannels = await getKnowledgeChannels(propertyId)
  const identity = await getCallerIdentity()
  let internalSyncDiagnostics: Awaited<ReturnType<typeof getInternalKnowledgeSyncDiagnostics>> | null = null
  if (identity?.isSuperAdmin && identity.propertyId) {
    try {
      if (await isVoiceSupportHub(identity.propertyId)) {
        internalSyncDiagnostics = await getInternalKnowledgeSyncDiagnostics(identity.propertyId)
      }
    } catch {
      internalSyncDiagnostics = {
        schemaAvailable: true,
        sources: [],
        error: "Impossibile leggere lo stato della sincronizzazione. Riprova più tardi.",
      }
    }
  }

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

        {internalSyncDiagnostics ? <InternalKnowledgeSyncStatusCard diagnostics={internalSyncDiagnostics} /> : null}

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
