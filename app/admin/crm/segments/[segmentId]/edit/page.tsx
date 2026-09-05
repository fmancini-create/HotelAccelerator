import { SegmentEditor } from "@/components/crm/segment-editor"

export default async function EditCrmSegmentPage({ params }: { params: Promise<{ segmentId: string }> }) {
  const { segmentId } = await params
  return <SegmentEditor segmentId={segmentId} />
}
