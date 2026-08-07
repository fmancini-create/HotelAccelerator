import { z } from "zod"

export const DEFAULT_PRIVACY_POLICY = `Il titolare del trattamento tratta i dati personali forniti tramite questo sito esclusivamente per rispondere alle richieste, gestire prenotazioni e adempiere agli obblighi di legge. I dati sono conservati per il tempo necessario alle finalità indicate e non sono ceduti a terzi salvo obblighi di legge o fornitori nominati responsabili del trattamento. L'interessato può esercitare i diritti previsti dagli articoli 15-22 del GDPR contattando il titolare.`

export const DEFAULT_COOKIE_POLICY = `Questo sito utilizza cookie tecnici necessari al proprio funzionamento. Cookie analitici o di marketing non essenziali vengono attivati soltanto dopo il consenso dell'utente. Il consenso può essere rifiutato o modificato in qualsiasi momento tramite le preferenze cookie disponibili nel footer.`

const NullableShortText = z.string().trim().max(500).nullable()

export const TenantSiteSettingsSchema = z.object({
  companyName: NullableShortText,
  vatNumber: NullableShortText,
  taxCode: NullableShortText,
  address: NullableShortText,
  city: NullableShortText,
  postalCode: NullableShortText,
  province: NullableShortText,
  email: z.string().trim().email().max(320).nullable().or(z.literal(null)),
  rea: NullableShortText,
  registry: NullableShortText,
  shareCapital: NullableShortText,
  privacyPolicy: z.string().trim().max(50000).default(DEFAULT_PRIVACY_POLICY),
  cookiePolicy: z.string().trim().max(50000).default(DEFAULT_COOKIE_POLICY),
  whiteLabel: z.boolean().default(false),
})

export type TenantSiteSettings = z.infer<typeof TenantSiteSettingsSchema>

export const EMPTY_TENANT_SITE_SETTINGS: TenantSiteSettings = {
  companyName: null,
  vatNumber: null,
  taxCode: null,
  address: null,
  city: null,
  postalCode: null,
  province: null,
  email: null,
  rea: null,
  registry: null,
  shareCapital: null,
  privacyPolicy: DEFAULT_PRIVACY_POLICY,
  cookiePolicy: DEFAULT_COOKIE_POLICY,
  whiteLabel: false,
}

export function mapPropertyToSiteSettings(row: Record<string, unknown>, whiteLabel: boolean): TenantSiteSettings {
  return TenantSiteSettingsSchema.parse({
    companyName: row.billing_company_name ?? null,
    vatNumber: row.billing_vat ?? null,
    taxCode: row.billing_tax_code ?? null,
    address: row.billing_address ?? null,
    city: row.billing_city ?? null,
    postalCode: row.billing_postal_code ?? null,
    province: row.billing_province ?? null,
    email: row.billing_email ?? null,
    rea: row.legal_rea ?? null,
    registry: row.legal_registry ?? null,
    shareCapital: row.legal_share_capital ?? null,
    privacyPolicy: row.site_privacy_policy || DEFAULT_PRIVACY_POLICY,
    cookiePolicy: row.site_cookie_policy || DEFAULT_COOKIE_POLICY,
    whiteLabel,
  })
}

export function legalDetails(settings: TenantSiteSettings): string[] {
  const locality = [settings.postalCode, settings.city, settings.province && `(${settings.province})`].filter(Boolean).join(" ")
  return [
    settings.companyName,
    [settings.address, locality].filter(Boolean).join(" · ") || null,
    settings.vatNumber ? `P. IVA ${settings.vatNumber}` : null,
    settings.taxCode ? `C.F. ${settings.taxCode}` : null,
    settings.registry ? `Registro Imprese ${settings.registry}` : null,
    settings.rea ? `REA ${settings.rea}` : null,
    settings.shareCapital ? `Capitale sociale ${settings.shareCapital}` : null,
  ].filter((value): value is string => Boolean(value))
}
