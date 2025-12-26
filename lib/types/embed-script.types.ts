export type EmbedScriptStatus = "draft" | "active" | "paused"

export type WidgetType = "booking" | "chat" | "contact" | "promo" | "gallery" | "reviews"

export type WidgetPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "center"
  | "top-banner"
  | "bottom-banner"

export interface WidgetStyle {
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderRadius?: number
  shadow?: string
  padding?: number
  fontSize?: number
}

export interface WidgetConfig {
  enabled: boolean
  position: WidgetPosition
  style?: WidgetStyle
  customCss?: string
}

export interface PromoMessage {
  id: string
  text: string
  cta?: {
    text: string
    url: string
    style?: "primary" | "secondary" | "outline"
  }
  position: WidgetPosition
  timing?: {
    showAfter?: number // ms
    autoClose?: number // ms
    showOnce?: boolean
  }
  targeting?: {
    pages?: string[] // URL patterns
    excludePages?: string[]
    newVisitors?: boolean
    returningVisitors?: boolean
    deviceType?: "mobile" | "desktop" | "tablet"
  }
  style?: WidgetStyle
}

export interface EmbedTheme {
  primaryColor: string
  secondaryColor?: string
  fontFamily: string
  borderRadius: number
}

export interface EmbedScriptConfig {
  widgets: {
    [K in WidgetType]?: WidgetConfig
  }
  theme: EmbedTheme
  promoMessages: PromoMessage[]
}

export interface EmbedScript {
  id: string
  property_id: string
  name: string
  description?: string
  destination_url: string
  status: EmbedScriptStatus
  config: EmbedScriptConfig
  views_count: number
  interactions_count: number
  last_used_at?: string
  created_at: string
  updated_at: string
}

export interface CreateEmbedScriptInput {
  name: string
  description?: string
  destination_url: string
  config?: Partial<EmbedScriptConfig>
}

export interface UpdateEmbedScriptInput {
  name?: string
  description?: string
  destination_url?: string
  status?: EmbedScriptStatus
  config?: Partial<EmbedScriptConfig>
}
