import { AnnaWidgetFrame } from "@/components/public/anna-widget-frame"

export const dynamic = "force-dynamic"

export default async function AnnaWidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicKey: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { publicKey } = await params
  const { page } = await searchParams

  return <AnnaWidgetFrame publicKey={publicKey} pageUrl={page || null} />
}
