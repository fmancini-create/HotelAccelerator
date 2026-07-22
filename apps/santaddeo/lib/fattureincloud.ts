/**
 * FattureInCloud API v2 Client
 *
 * Gestisce la creazione di clienti e fatture su FattureInCloud.
 * Usato dal webhook Stripe per emettere fatture automatiche.
 *
 * API Docs: https://developers.fattureincloud.it/api-reference
 */

import "server-only"

// =============================================================================
// Types
// =============================================================================

export interface FicAddress {
  street?: string
  city?: string
  postal_code?: string
  province?: string // Sigla provincia (es. "FI", "MI")
  country?: string // Codice ISO (es. "IT")
}

export interface FicClientData {
  name: string
  email?: string
  vat_number?: string // P.IVA
  tax_code?: string // Codice fiscale
  ei_code?: string // Codice SDI (default "0000000")
  certified_email?: string // PEC
  address_street?: string
  address_city?: string
  address_postal_code?: string
  address_province?: string
  address_country?: string
}

export interface FicInvoiceItem {
  name: string
  description?: string
  qty: number
  net_price: number // Prezzo netto unitario in EUR
  vat: {
    id: number // ID aliquota IVA in FIC (es. 0 = 22%)
  }
}

export interface FicInvoiceData {
  client_id: number
  date: string // YYYY-MM-DD
  items: FicInvoiceItem[]
  payment_method?: {
    id: number // ID metodo pagamento in FIC
  }
  notes?: string
  // Riferimento interno per tracciabilita'
  numeration?: string
}

export interface FicClient {
  id: number
  name: string
  vat_number?: string
  tax_code?: string
  email?: string
}

export interface FicDocument {
  id: number
  type: string
  number: number
  numeration: string
  date: string
  amount_net: number
  amount_vat: number
  amount_gross: number
  url?: string
}

export interface FicApiError {
  error: {
    message: string
    code: string
    validation_result?: Record<string, string[]>
  }
}

// =============================================================================
// Configuration
// =============================================================================

const FIC_BASE_URL = "https://api-v2.fattureincloud.it"

function getCompanyId(): string {
  const companyId = process.env.FATTUREINCLOUD_COMPANY_ID
  if (!companyId) {
    throw new Error("FATTUREINCLOUD_COMPANY_ID is not set")
  }
  return companyId
}

function getAccessToken(): string {
  const token = process.env.FATTUREINCLOUD_ACCESS_TOKEN
  if (!token) {
    throw new Error("FATTUREINCLOUD_ACCESS_TOKEN is not set")
  }
  return token
}

function getHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

// =============================================================================
// API Helpers
// =============================================================================

async function ficFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const companyId = getCompanyId()
  const url = `${FIC_BASE_URL}/c/${companyId}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data as FicApiError
    throw new Error(
      `FattureInCloud API error: ${error.error?.message || response.statusText} (${response.status})`
    )
  }

  return data as T
}

// =============================================================================
// Client (Anagrafica) Operations
// =============================================================================

/**
 * Cerca un cliente esistente per P.IVA o codice fiscale
 */
export async function findClientByVatOrTaxCode(
  vatNumber?: string,
  taxCode?: string
): Promise<FicClient | null> {
  if (!vatNumber && !taxCode) return null

  // Cerca per P.IVA
  if (vatNumber) {
    const result = await ficFetch<{ data: FicClient[] }>(
      `/entities/clients?vat_number=${encodeURIComponent(vatNumber)}`
    )
    if (result.data && result.data.length > 0) {
      return result.data[0]
    }
  }

  // Cerca per codice fiscale
  if (taxCode) {
    const result = await ficFetch<{ data: FicClient[] }>(
      `/entities/clients?tax_code=${encodeURIComponent(taxCode)}`
    )
    if (result.data && result.data.length > 0) {
      return result.data[0]
    }
  }

  return null
}

/**
 * Crea un nuovo cliente su FattureInCloud
 */
export async function createClient(
  clientData: FicClientData
): Promise<FicClient> {
  const payload = {
    data: {
      name: clientData.name,
      type: "company", // o "person" per privati
      vat_number: clientData.vat_number || "",
      tax_code: clientData.tax_code || "",
      email: clientData.email || "",
      certified_email: clientData.certified_email || "",
      ei_code: clientData.ei_code || "0000000", // Default SDI
      address_street: clientData.address_street || "",
      address_city: clientData.address_city || "",
      address_postal_code: clientData.address_postal_code || "",
      address_province: clientData.address_province || "",
      address_country: clientData.address_country || "Italia",
    },
  }

  const result = await ficFetch<{ data: FicClient }>("/entities/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  return result.data
}

/**
 * Crea o recupera un cliente esistente
 * Cerca prima per P.IVA/CF, se non trovato lo crea
 */
export async function createOrGetClient(
  clientData: FicClientData
): Promise<FicClient> {
  // Prova a trovare cliente esistente
  const existing = await findClientByVatOrTaxCode(
    clientData.vat_number,
    clientData.tax_code
  )

  if (existing) {
    return existing
  }

  // Crea nuovo cliente
  return createClient(clientData)
}

// =============================================================================
// Invoice (Fattura) Operations
// =============================================================================

/**
 * IDs standard FattureInCloud (da configurare in base al tuo account)
 * Questi sono valori di default, potrebbero variare
 */
export const FIC_DEFAULTS = {
  // Aliquota IVA 22% - l'ID esatto va verificato nel tuo account FIC
  VAT_22_ID: 0, // 0 = aliquota standard 22%
  // Metodo pagamento Stripe/Carta
  PAYMENT_METHOD_CARD_ID: 543, // Da verificare nel tuo account
  // Numerazione standard
  NUMERATION: "", // Vuoto = numerazione di default
}

/**
 * Crea una fattura su FattureInCloud
 */
export async function createInvoice(
  invoiceData: FicInvoiceData
): Promise<FicDocument> {
  const payload = {
    data: {
      type: "invoice", // Fattura
      entity: {
        id: invoiceData.client_id,
      },
      date: invoiceData.date,
      numeration: invoiceData.numeration || FIC_DEFAULTS.NUMERATION,
      items_list: invoiceData.items.map((item) => ({
        name: item.name,
        description: item.description || "",
        qty: item.qty,
        net_price: item.net_price,
        vat: item.vat,
      })),
      payments_list: invoiceData.payment_method
        ? [
            {
              due_date: invoiceData.date,
              amount: invoiceData.items.reduce(
                (sum, item) => sum + item.net_price * item.qty * 1.22,
                0
              ),
              status: "paid",
              paid_date: invoiceData.date,
              payment_method: invoiceData.payment_method,
            },
          ]
        : [],
      notes: invoiceData.notes || "",
      // Impostazioni fattura elettronica
      e_invoice: true,
      ei_data: {
        payment_method: "MP08", // Carta di credito
      },
    },
  }

  const result = await ficFetch<{ data: FicDocument }>("/issued_documents", {
    method: "POST",
    body: JSON.stringify(payload),
  })

  return result.data
}

/**
 * Invia la fattura via email al cliente
 */
export async function sendInvoiceEmail(
  documentId: number,
  recipientEmail: string,
  options?: {
    subject?: string
    body?: string
    includeAttachment?: boolean
  }
): Promise<boolean> {
  const payload = {
    data: {
      recipient_email: recipientEmail,
      subject:
        options?.subject || "La tua fattura da Santaddeo Revenue Management",
      body:
        options?.body ||
        "In allegato trovi la fattura relativa al tuo acquisto. Grazie per aver scelto Santaddeo!",
      include: {
        document: options?.includeAttachment !== false,
        delivery_note: false,
        attachment: false,
        accompanying_invoice: false,
      },
    },
  }

  try {
    await ficFetch(`/issued_documents/${documentId}/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
    return true
  } catch (error) {
    console.error("[FIC] Failed to send invoice email:", error)
    return false
  }
}

/**
 * Recupera una fattura per ID
 */
export async function getInvoice(documentId: number): Promise<FicDocument> {
  const result = await ficFetch<{ data: FicDocument }>(
    `/issued_documents/${documentId}`
  )
  return result.data
}

// =============================================================================
// Helper: Create invoice from Stripe payment data
// =============================================================================

export interface StripePaymentData {
  invoiceId: string
  customerId?: string
  customerEmail?: string
  customerName?: string
  amountCents: number
  currency: string
  description?: string
  // Dati fiscali raccolti da Stripe checkout
  vatNumber?: string
  taxCode?: string
  sdiCode?: string
  pec?: string
  address?: FicAddress
}

/**
 * Crea una fattura FIC completa a partire dai dati di un pagamento Stripe
 * Ritorna l'ID documento FIC e se l'email e' stata inviata
 */
export async function createInvoiceFromStripePayment(
  data: StripePaymentData
): Promise<{
  documentId: number
  documentNumber: string
  clientId: number
  emailSent: boolean
}> {
  // 1. Crea o recupera cliente
  const client = await createOrGetClient({
    name: data.customerName || data.customerEmail || "Cliente",
    email: data.customerEmail,
    vat_number: data.vatNumber,
    tax_code: data.taxCode,
    ei_code: data.sdiCode || "0000000",
    certified_email: data.pec,
    address_street: data.address?.street,
    address_city: data.address?.city,
    address_postal_code: data.address?.postal_code,
    address_province: data.address?.province,
    address_country: data.address?.country || "IT",
  })

  // 2. Calcola importo netto (il lordo da Stripe include gia' IVA)
  // Stripe amount e' in centesimi, FIC vuole EUR
  const grossAmount = data.amountCents / 100
  const netAmount = grossAmount / 1.22 // Scorporo IVA 22%

  // 3. Crea fattura
  const invoice = await createInvoice({
    client_id: client.id,
    date: new Date().toISOString().split("T")[0], // YYYY-MM-DD
    items: [
      {
        name: data.description || "Servizio Santaddeo Revenue Management",
        qty: 1,
        net_price: Math.round(netAmount * 100) / 100, // Arrotonda a 2 decimali
        vat: { id: FIC_DEFAULTS.VAT_22_ID },
      },
    ],
    payment_method: { id: FIC_DEFAULTS.PAYMENT_METHOD_CARD_ID },
    notes: `Pagamento Stripe: ${data.invoiceId}`,
  })

  // 4. Invia email se abbiamo l'indirizzo
  let emailSent = false
  if (data.customerEmail) {
    emailSent = await sendInvoiceEmail(invoice.id, data.customerEmail)
  }

  return {
    documentId: invoice.id,
    documentNumber: `${invoice.numeration}${invoice.number}`,
    clientId: client.id,
    emailSent,
  }
}
