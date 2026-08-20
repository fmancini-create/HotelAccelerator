export type VoiceAgentKnowledgeBase = {
  id: string
  name: string
  source_count: number
}

/**
 * Trasforma esclusivamente le basi del tenant corrente in agenti telefonici.
 * Non esistono nomi o prodotti preimpostati: la base scelta dall'amministratore
 * determina il nome e il contenuto dell'agente.
 */
export function createVoiceAgentLinks(input: {
  rootUrl: string
  propertyId: string
  knowledgeBases: VoiceAgentKnowledgeBase[]
  fallbackExtension?: string
}) {
  const root = input.rootUrl.replace(/\/+$/, "")
  const property = encodeURIComponent(input.propertyId)
  const fallbackExtension = input.fallbackExtension ?? "200"

  return input.knowledgeBases.map((base) => ({
    key: base.id,
    label: base.name,
    fallback_extension: fallbackExtension,
    status: base.source_count < 1 ? ("empty" as const) : ("ready" as const),
    knowledge_base: {
      id: base.id,
      name: base.name,
      source_count: base.source_count,
    },
    query_url: `${root}/api/telephony/3cx/voice/v1/query?property=${property}&knowledge_base=${encodeURIComponent(base.id)}`,
  }))
}
