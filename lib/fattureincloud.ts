import "server-only"

const BASE_URL = "https://api-v2.fattureincloud.it"

interface FicClient {
  /** The customer in FattureInCloud (anagrafica cliente). */
  id?: number
  name: string
  vat_number?: string | null
  tax_code?: string | null
  address_street?: string | null
  address_city?: string | null
  address_postal_code?: string | null
  address_province?: string | null
  address_country?: string | null
  email?: string | null
  pec?: string | null
  sdi_code?: string | null
}

interface FicInvoiceItem {
  product_id?: number
  code?: string
  name: string
  description?: string
  qty: number
  measure?: string
  net_price: number // unit price excluding VAT
  vat: { id: number } // VAT rate ID (e.g., 0 = 22%)
  discount?: number
}

interface CreateInvoiceParams {
  client: FicClient
  items: FicInvoiceItem[]
  /** Payment method ID in FattureInCloud (e.g., 123 = Stripe). */
  paymentMethodId?: number
  /** Invoice date (ISO). Defaults to today. */
  date?: string
  /** Due date (ISO). */
  dueDate?: string
  /** Internal notes (not shown to client). */
  internalNotes?: string
  /** Public notes (shown on invoice). */
  notes?: string
  /** Send invoice via email after creation. */
  sendEmail?: boolean
  /** Send invoice to SDI (electronic invoicing). */
  sendToSdi?: boolean
}

interface FicInvoice {
  id: number
  number: number
  year: number
  date: string
  url?: string
}

class FattureInCloudClient {
  private accessToken: string
  private companyId: string

  constructor() {
    const token = process.env.FATTUREINCLOUD_ACCESS_TOKEN
    const companyId = process.env.FATTUREINCLOUD_COMPANY_ID
    if (!token || !companyId) {
      throw new Error("FATTUREINCLOUD_ACCESS_TOKEN and FATTUREINCLOUD_COMPANY_ID must be set")
    }
    this.accessToken = token
    this.companyId = companyId
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${BASE_URL}/c/${this.companyId}${path}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`[FattureInCloud] ${method} ${path} failed:`, res.status, errorBody)
      throw new Error(`FattureInCloud API error: ${res.status}`)
    }

    return res.json() as Promise<T>
  }

  /**
   * Find or create a client (anagrafica) by VAT number or name.
   */
  async findOrCreateClient(client: FicClient): Promise<number> {
    // Try to find by VAT number first
    if (client.vat_number) {
      const search = await this.request<{ data: { id: number }[] }>(
        "GET",
        `/entities/clients?q=${encodeURIComponent(client.vat_number)}&per_page=1`,
      )
      if (search.data.length > 0) {
        return search.data[0].id
      }
    }

    // Try to find by name
    const searchByName = await this.request<{ data: { id: number }[] }>(
      "GET",
      `/entities/clients?q=${encodeURIComponent(client.name)}&per_page=1`,
    )
    if (searchByName.data.length > 0) {
      return searchByName.data[0].id
    }

    // Create new client
    const created = await this.request<{ data: { id: number } }>("POST", "/entities/clients", {
      data: {
        name: client.name,
        vat_number: client.vat_number || "",
        tax_code: client.tax_code || "",
        address_street: client.address_street || "",
        address_city: client.address_city || "",
        address_postal_code: client.address_postal_code || "",
        address_province: client.address_province || "",
        address_country: client.address_country || "Italia",
        email: client.email || "",
        certified_email: client.pec || "",
        ei_code: client.sdi_code || "0000000",
      },
    })

    return created.data.id
  }

  /**
   * Create a draft invoice.
   */
  async createInvoice(params: CreateInvoiceParams): Promise<FicInvoice> {
    const clientId = params.client.id ?? (await this.findOrCreateClient(params.client))

    const today = new Date().toISOString().split("T")[0]
    const invoiceDate = params.date || today

    const result = await this.request<{ data: FicInvoice }>("POST", "/issued_documents", {
      data: {
        type: "invoice",
        entity: { id: clientId },
        date: invoiceDate,
        payment_terms: {
          days: 30,
          type: "standard",
        },
        items_list: params.items.map((item) => ({
          product_id: item.product_id,
          code: item.code,
          name: item.name,
          description: item.description,
          qty: item.qty,
          measure: item.measure || "pz",
          net_price: item.net_price,
          vat: item.vat,
          discount: item.discount || 0,
        })),
        payments_list: params.paymentMethodId
          ? [
              {
                payment_method: { id: params.paymentMethodId },
                amount: params.items.reduce((sum, i) => sum + i.net_price * i.qty * 1.22, 0), // Gross
                due_date: params.dueDate || invoiceDate,
                status: "paid",
                paid_date: invoiceDate,
              },
            ]
          : [],
        notes: params.notes || "",
        internal_notes: params.internalNotes || "",
        // Electronic invoicing settings
        ei_data: {
          payment_method: "MP08", // Carta di credito
        },
      },
    })

    // Optionally send to SDI
    if (params.sendToSdi && result.data.id) {
      try {
        await this.request("POST", `/issued_documents/${result.data.id}/e_invoice/send`, {})
      } catch (err) {
        console.error("[FattureInCloud] SDI send failed, invoice created as draft:", err)
      }
    }

    // Optionally send email
    if (params.sendEmail && result.data.id) {
      try {
        await this.request("POST", `/issued_documents/${result.data.id}/email`, {
          data: {
            recipient_email: params.client.email,
            subject: `Fattura n. ${result.data.number}/${result.data.year}`,
            body: "In allegato la fattura. Grazie per aver scelto HotelAccelerator.",
            include_document_attachment: true,
          },
        })
      } catch (err) {
        console.error("[FattureInCloud] Email send failed:", err)
      }
    }

    return result.data
  }

  /**
   * Get invoice PDF URL.
   */
  async getInvoicePdfUrl(invoiceId: number): Promise<string> {
    const result = await this.request<{ data: { url: string } }>(
      "GET",
      `/issued_documents/${invoiceId}/pdf`,
    )
    return result.data.url
  }

  /**
   * List VAT rates to get the correct ID for 22%.
   */
  async getVatRates(): Promise<{ id: number; value: number; description: string }[]> {
    const result = await this.request<{
      data: { id: number; value: number; description: string }[]
    }>("GET", "/info/vat_types")
    return result.data
  }
}

// Singleton instance
let _client: FattureInCloudClient | null = null

export function getFattureInCloudClient(): FattureInCloudClient {
  if (!_client) {
    _client = new FattureInCloudClient()
  }
  return _client
}

export type { FicClient, FicInvoiceItem, CreateInvoiceParams, FicInvoice }
