import { ProspectDetailClient } from "./prospect-detail-client"

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <ProspectDetailClient prospectId={id} />
    </div>
  )
}
