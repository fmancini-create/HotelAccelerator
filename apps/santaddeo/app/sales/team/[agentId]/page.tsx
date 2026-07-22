import { TeamAgentDetailClient } from "./team-agent-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dettaglio agente - SANTADDEO" }

export default async function TeamAgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>
}) {
  const { agentId } = await params
  return <TeamAgentDetailClient agentId={agentId} />
}
