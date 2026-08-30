import { notFound } from "next/navigation"
import { SocialChannelPage } from "@/components/admin/channels/social-channel-page"

const SOCIAL_PROVIDER_ROUTES = ["facebook", "instagram", "twitter", "linkedin"] as const

type SocialProviderRoute = (typeof SOCIAL_PROVIDER_ROUTES)[number]

export default async function SocialProviderPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!SOCIAL_PROVIDER_ROUTES.includes(provider as SocialProviderRoute)) notFound()
  return <SocialChannelPage provider={provider as SocialProviderRoute} />
}
