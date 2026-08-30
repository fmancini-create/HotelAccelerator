export type SocialProvider = "facebook" | "instagram" | "x" | "linkedin"
export type SocialChannelType = "messenger" | "instagram" | "x" | "linkedin"

export type SocialCapability =
  | "direct_messages"
  | "mentions"
  | "comments"
  | "posts"
  | "reactions"

export interface SocialProviderDefinition {
  id: SocialProvider
  label: string
  channelType: SocialChannelType
  description: string
  capabilities: SocialCapability[]
  approvalNote: string
}

export const SOCIAL_PROVIDERS: Record<SocialProvider, SocialProviderDefinition> = {
  facebook: {
    id: "facebook",
    label: "Facebook",
    channelType: "messenger",
    description: "Messenger e commenti della Pagina nella Inbox.",
    capabilities: ["direct_messages", "comments"],
    approvalNote: "Richiede le autorizzazioni Meta approvate per l'app in produzione.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram Business",
    channelType: "instagram",
    description: "DM, menzioni e commenti del profilo Business nella Inbox.",
    capabilities: ["direct_messages", "mentions", "comments"],
    approvalNote: "Richiede un account Instagram Business/Professional e le autorizzazioni Meta approvate.",
  },
  x: {
    id: "x",
    label: "X",
    channelType: "x",
    description: "Menzioni secondo il piano API; DM solo se il piano e gli scope dell'app li abilitano.",
    capabilities: ["mentions"],
    approvalNote: "I DM vengono attivati solo se X concede dm.read/dm.write all'app e al piano API in uso.",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    channelType: "linkedin",
    description: "Pagina aziendale, post, commenti e reazioni. Nessun DM di Pagina simulato.",
    capabilities: ["posts", "comments", "reactions"],
    approvalNote: "Richiede l'approvazione LinkedIn Community Management e i relativi permessi organizzazione.",
  },
}

export function isSocialProvider(value: string): value is SocialProvider {
  return value === "facebook" || value === "instagram" || value === "x" || value === "linkedin"
}

export function getSocialProvider(value: string): SocialProviderDefinition {
  if (!isSocialProvider(value)) throw new Error("Provider social non supportato")
  return SOCIAL_PROVIDERS[value]
}

export function getMetaGraphVersion(): string {
  return process.env.META_GRAPH_VERSION || "v26.0"
}

export function providerEnvReady(provider: SocialProvider): boolean {
  if (provider === "facebook" || provider === "instagram") {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)
  }
  if (provider === "x") {
    return Boolean(process.env.X_CLIENT_ID)
  }
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

export function xDmRequested(): boolean {
  return process.env.X_ENABLE_DM === "true"
}

export function oauthScopes(provider: SocialProvider): string[] {
  if (provider === "facebook") {
    return [
      "pages_show_list",
      "pages_read_engagement",
      "pages_read_user_content",
      "pages_manage_engagement",
      "pages_messaging",
    ]
  }
  if (provider === "instagram") {
    return [
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_comments",
      "instagram_manage_messages",
    ]
  }
  if (provider === "x") {
    const scopes = ["tweet.read", "users.read", "offline.access"]
    if (xDmRequested()) scopes.push("dm.read", "dm.write")
    return scopes
  }
  return ["openid", "profile", "rw_organization_admin", "r_organization_social", "w_organization_social"]
}
