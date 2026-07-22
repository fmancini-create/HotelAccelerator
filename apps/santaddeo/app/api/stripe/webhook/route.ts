/**
 * Stripe Webhook per FattureInCloud
 *
 * Gestisce l'evento `invoice.paid` per creare automaticamente
 * fatture su FattureInCloud quando un pagamento Stripe viene completato.
 *
 * Filtro: processa solo eventi con metadata.project === "santaddeo"
 * Idempotenza: garantita da fic_invoices_log.stripe_invoice_id UNIQUE
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import {
  createInvoiceFromStripePayment,
  type FicAddress,
} from "@/lib/fattureincloud"

// Lazy initialization to avoid build-time errors
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia",
  })
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const maxDuration = 60 // 60s timeout for FIC API calls

export async function POST(request: NextRequest) {
  const stripe = getStripe()
  const supabaseAdmin = getSupabaseAdmin()
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_FIC_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Senza secret, constructEvent lancerebbe un criptico
    // "No signatures found matching the expected signature".
    // Logghiamo la causa reale per non perdere tempo a debuggarla.
    console.error(
      "[FIC Webhook] STRIPE_FIC_WEBHOOK_SECRET non impostata: impossibile verificare la firma dell'endpoint 'SANTADDEO FATTURE'"
    )
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    )
  }

  // Verify webhook signature
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("[FIC Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Only process invoice.paid
  if (event.type !== "invoice.paid") {
    return NextResponse.json({ received: true, skipped: "event_type" })
  }

  const invoice = event.data.object as Stripe.Invoice

  // Filter by project metadata - only process Santaddeo invoices
  // Check invoice metadata OR subscription metadata OR checkout session metadata
  const projectTag =
    invoice.metadata?.project ||
    (invoice.subscription_details as { metadata?: { project?: string } })
      ?.metadata?.project

  if (projectTag !== "santaddeo") {
    console.log(
      `[FIC Webhook] Skipping invoice ${invoice.id} - not a santaddeo project`
    )
    return NextResponse.json({ received: true, skipped: "not_santaddeo" })
  }

  // Skip $0 invoices (trial starts, etc)
  if (!invoice.amount_paid || invoice.amount_paid === 0) {
    console.log(`[FIC Webhook] Skipping invoice ${invoice.id} - zero amount`)
    return NextResponse.json({ received: true, skipped: "zero_amount" })
  }

  try {
    // Idempotency check: skip if already processed
    const { data: existingLog } = await supabaseAdmin
      .from("fic_invoices_log")
      .select("id, status")
      .eq("stripe_invoice_id", invoice.id)
      .single()

    if (existingLog) {
      console.log(
        `[FIC Webhook] Invoice ${invoice.id} already processed (status: ${existingLog.status})`
      )
      return NextResponse.json({
        received: true,
        skipped: "already_processed",
        status: existingLog.status,
      })
    }

    // Extract customer data
    let customerEmail = invoice.customer_email || ""
    let customerName = invoice.customer_name || ""
    let vatNumber: string | undefined
    let taxCode: string | undefined
    let sdiCode: string | undefined
    let pec: string | undefined
    let address: FicAddress | undefined

    // Get full customer object for tax IDs and address
    if (invoice.customer) {
      const customer = await stripe.customers.retrieve(
        invoice.customer as string
      )
      if (!("deleted" in customer)) {
        customerEmail = customerEmail || customer.email || ""
        customerName = customerName || customer.name || ""

        // Extract tax IDs
        if (customer.tax_ids?.data) {
          for (const taxId of customer.tax_ids.data) {
            if (taxId.type === "eu_vat" && taxId.country === "IT") {
              vatNumber = taxId.value
            }
            // Italian fiscal code
            if (taxId.type === "it_fiscal_code") {
              taxCode = taxId.value
            }
          }
        }

        // Extract address
        if (customer.address) {
          address = {
            street: customer.address.line1 || "",
            city: customer.address.city || "",
            postal_code: customer.address.postal_code || "",
            province: customer.address.state || "",
            country: customer.address.country || "IT",
          }
        }
      }
    }

    // Try to get SDI/PEC from checkout session custom fields
    // These are stored in invoice.metadata or subscription metadata
    sdiCode =
      invoice.metadata?.sdi_code ||
      (invoice.subscription_details as { metadata?: { sdi_code?: string } })
        ?.metadata?.sdi_code
    pec =
      invoice.metadata?.pec ||
      (invoice.subscription_details as { metadata?: { pec?: string } })
        ?.metadata?.pec

    // Extract hotel_id and organization_id from metadata
    const hotelId =
      invoice.metadata?.hotel_id ||
      (invoice.subscription_details as { metadata?: { hotel_id?: string } })
        ?.metadata?.hotel_id
    const organizationId =
      invoice.metadata?.organization_id ||
      (
        invoice.subscription_details as {
          metadata?: { organization_id?: string }
        }
      )?.metadata?.organization_id

    // Fallback: lookup organization from DB to get fiscal data
    if (organizationId && (!vatNumber || !sdiCode)) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name, vat_number, tax_code, sdi_code, pec, billing_address")
        .eq("id", organizationId)
        .single()

      if (org) {
        vatNumber = vatNumber || org.vat_number || undefined
        taxCode = taxCode || org.tax_code || undefined
        sdiCode = sdiCode || org.sdi_code || undefined
        pec = pec || org.pec || undefined
        customerName = customerName || org.name || ""
        if (!address && org.billing_address) {
          address = org.billing_address as FicAddress
        }
      }
    }

    // Determine product description
    const productType =
      invoice.metadata?.product_type ||
      (invoice.subscription_details as { metadata?: { product_type?: string } })
        ?.metadata?.product_type ||
      "service"
    const description = getInvoiceDescription(productType, invoice)

    // Create initial log entry (pending)
    const { data: logEntry, error: insertError } = await supabaseAdmin
      .from("fic_invoices_log")
      .insert({
        stripe_invoice_id: invoice.id,
        stripe_customer_id: invoice.customer as string,
        stripe_subscription_id: invoice.subscription as string | null,
        hotel_id: hotelId || null,
        organization_id: organizationId || null,
        amount_cents: invoice.amount_paid,
        currency: invoice.currency.toUpperCase(),
        description,
        product_type: productType,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_vat_number: vatNumber || null,
        customer_tax_code: taxCode || null,
        customer_sdi_code: sdiCode || null,
        customer_pec: pec || null,
        customer_address: address || null,
        status: "pending",
      })
      .select("id")
      .single()

    if (insertError) {
      // Could be duplicate key (race condition) - check again
      if (insertError.code === "23505") {
        console.log(
          `[FIC Webhook] Invoice ${invoice.id} already being processed (race condition)`
        )
        return NextResponse.json({
          received: true,
          skipped: "race_condition",
        })
      }
      throw insertError
    }

    // Skip FIC creation if missing required fiscal data
    if (!vatNumber && !taxCode) {
      console.warn(
        `[FIC Webhook] Invoice ${invoice.id} missing fiscal data, marking as skipped`
      )
      await supabaseAdmin
        .from("fic_invoices_log")
        .update({
          status: "skipped",
          error_message: "Missing VAT number and tax code",
        })
        .eq("id", logEntry.id)

      return NextResponse.json({
        received: true,
        status: "skipped",
        reason: "missing_fiscal_data",
      })
    }

    // Create invoice on FattureInCloud
    try {
      const ficResult = await createInvoiceFromStripePayment({
        invoiceId: invoice.id,
        customerId: invoice.customer as string,
        customerEmail,
        customerName,
        amountCents: invoice.amount_paid,
        currency: invoice.currency,
        description,
        vatNumber,
        taxCode,
        sdiCode,
        pec,
        address,
      })

      // Update log with success
      await supabaseAdmin
        .from("fic_invoices_log")
        .update({
          status: ficResult.emailSent ? "sent" : "created",
          fic_document_id: ficResult.documentId,
          fic_document_number: ficResult.documentNumber,
          fic_client_id: ficResult.clientId,
          email_sent_at: ficResult.emailSent ? new Date().toISOString() : null,
        })
        .eq("id", logEntry.id)

      // Update organization with FIC client ID for future lookups
      if (organizationId && ficResult.clientId) {
        await supabaseAdmin
          .from("organizations")
          .update({ fic_client_id: ficResult.clientId })
          .eq("id", organizationId)
          .is("fic_client_id", null) // Only if not already set
      }

      console.log(
        `[FIC Webhook] Invoice ${invoice.id} -> FIC document ${ficResult.documentNumber} (email: ${ficResult.emailSent})`
      )

      return NextResponse.json({
        received: true,
        status: "created",
        fic_document_id: ficResult.documentId,
        fic_document_number: ficResult.documentNumber,
        email_sent: ficResult.emailSent,
      })
    } catch (ficError) {
      // FIC API error - log and mark as failed
      const errorMessage =
        ficError instanceof Error ? ficError.message : "Unknown FIC error"
      console.error(`[FIC Webhook] FIC API error for ${invoice.id}:`, ficError)

      await supabaseAdmin
        .from("fic_invoices_log")
        .update({
          status: "failed",
          error_message: errorMessage,
          retry_count: 1,
        })
        .eq("id", logEntry.id)

      // Return 200 to acknowledge receipt (don't make Stripe retry)
      // Failed invoices can be retried manually or via cron
      return NextResponse.json({
        received: true,
        status: "failed",
        error: errorMessage,
      })
    }
  } catch (error) {
    console.error(`[FIC Webhook] Processing error for ${invoice.id}:`, error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}

/**
 * Generate invoice description based on product type
 */
function getInvoiceDescription(
  productType: string,
  invoice: Stripe.Invoice
): string {
  const period = invoice.lines?.data?.[0]?.period
  const periodStr = period
    ? ` (${formatDate(period.start)} - ${formatDate(period.end)})`
    : ""

  switch (productType) {
    case "addon_guard":
      return `Addon Guard - Monitoraggio prenotazioni${periodStr}`
    case "addon_seo":
      return `Addon SEO - Ottimizzazione motori di ricerca${periodStr}`
    case "addon_whatsapp":
      return `Addon WhatsApp - Integrazione messaggistica${periodStr}`
    case "accelerator_fee":
      return `Hotel Accelerator - Fee mensile${periodStr}`
    case "accelerator_setup":
      return `Hotel Accelerator - Setup iniziale`
    case "commission":
      return `Commissioni Revenue Management${periodStr}`
    default:
      return `Servizio Santaddeo Revenue Management${periodStr}`
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}
