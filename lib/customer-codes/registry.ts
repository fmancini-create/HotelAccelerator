import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { getSuiteProduct, type SuiteProductKey } from "@/lib/customer-codes/product"

export interface CustomerProductCode {
  code: string
  productKey: SuiteProductKey
}

interface CustomerAccount {
  id: string
  property_id: string | null
  account_number: number
}

async function getCustomerAccount(propertyId: string): Promise<CustomerAccount | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("customer_accounts")
    .select("id, property_id, account_number")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (error) throw error
  return data as CustomerAccount | null
}

async function getCustomerAccountById(customerAccountId: string): Promise<CustomerAccount | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("customer_accounts")
    .select("id, property_id, account_number")
    .eq("id", customerAccountId)
    .maybeSingle()

  if (error) throw error
  return data as CustomerAccount | null
}

/**
 * Genera/recupera il codice prodotto direttamente dall'account centrale.
 * Serve anche agli account standalone, che volutamente non hanno property_id
 * finche' il cliente non viene collegato a un tenant HotelAccelerator.
 */
async function getOrCreateCustomerProductCodeForAccount(
  customerAccountId: string,
  productKey: SuiteProductKey,
): Promise<CustomerProductCode | null> {
  const product = getSuiteProduct(productKey)
  if (!product) return null

  const supabase = createServiceClient()
  const existing = await supabase
    .from("customer_product_codes")
    .select("code, product_key")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", product.key)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) {
    return { code: existing.data.code, productKey: existing.data.product_key as SuiteProductKey }
  }

  const created = await supabase
    .from("customer_product_codes")
    .insert({ customer_account_id: customerAccountId, product_key: product.key })
    .select("code, product_key")
    .single()

  if (!created.error && created.data) {
    return { code: created.data.code, productKey: created.data.product_key as SuiteProductKey }
  }

  // Due richieste contemporanee possono provare a creare lo stesso codice.
  // Il vincolo unico nel database e questa seconda lettura rendono il risultato
  // idempotente senza nascondere altri errori reali.
  const raced = await supabase
    .from("customer_product_codes")
    .select("code, product_key")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", product.key)
    .maybeSingle()

  if (raced.error) throw created.error ?? raced.error
  if (!raced.data) throw created.error
  return { code: raced.data.code, productKey: raced.data.product_key as SuiteProductKey }
}

/**
 * Restituisce il codice di un prodotto per un account di suite. La generazione
 * e' idempotente: il database compone codice e prefisso a partire dal numero
 * centrale, senza affidarsi a logica duplicata nell'applicazione.
 */
export async function getOrCreateCustomerProductCode(
  propertyId: string,
  productKey: SuiteProductKey,
): Promise<CustomerProductCode | null> {
  const account = await getCustomerAccount(propertyId)
  if (!account) return null
  return getOrCreateCustomerProductCodeForAccount(account.id, productKey)
}

export async function findCustomerProductCode(code: string, productKey: SuiteProductKey): Promise<{
  propertyId: string | null
  code: string
} | null> {
  const supabase = createServiceClient()
  const productCode = await supabase
    .from("customer_product_codes")
    .select("customer_account_id, code")
    .eq("code", code)
    .eq("product_key", productKey)
    .maybeSingle()

  if (productCode.error) throw productCode.error
  if (!productCode.data) return null

  const account = await supabase
    .from("customer_accounts")
    .select("property_id")
    .eq("id", productCode.data.customer_account_id)
    .maybeSingle()

  if (account.error) throw account.error
  if (!account.data) return null

  return { propertyId: account.data.property_id, code: productCode.data.code }
}

export interface SuiteTenantLink {
  productKey: SuiteProductKey
  externalTenantId: string
  customerAccountId: string
  createdAt: string
}

export type LinkExternalTenantResult =
  | { conflict: true; link: SuiteTenantLink }
  | { conflict: false; code: CustomerProductCode; link: SuiteTenantLink }

/**
 * Collega un tenant di un prodotto autonomo al tenant Core dell'utente che lo
 * configura. Un link esistente non puo' essere riassegnato silenziosamente a
 * un'altra struttura: servira' un'operazione amministrativa esplicita.
 */
export async function linkExternalTenant(input: {
  propertyId: string
  productKey: SuiteProductKey
  externalTenantId: string
  createdByUserId?: string | null
}): Promise<LinkExternalTenantResult | null> {
  const product = getSuiteProduct(input.productKey)
  if (!product) return null

  const account = await getCustomerAccount(input.propertyId)
  if (!account) return null

  const supabase = createServiceClient()
  const existing = await supabase
    .from("suite_tenant_links")
    .select("customer_account_id, product_key, external_tenant_id, created_at")
    .eq("product_key", product.key)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data && existing.data.customer_account_id !== account.id) {
    return {
      conflict: true,
      link: {
        productKey: existing.data.product_key as SuiteProductKey,
        externalTenantId: existing.data.external_tenant_id,
        customerAccountId: existing.data.customer_account_id,
        createdAt: existing.data.created_at,
      },
    }
  }

  if (!existing.data) {
    const { error } = await supabase.from("suite_tenant_links").insert({
      customer_account_id: account.id,
      product_key: product.key,
      external_tenant_id: input.externalTenantId,
      created_by_user_id: input.createdByUserId ?? null,
    })
    if (error) throw error
  }

  const code = await getOrCreateCustomerProductCodeForAccount(account.id, product.key)
  if (!code) return null
  return {
    code,
    conflict: false,
    link: {
      productKey: product.key,
      externalTenantId: input.externalTenantId,
      customerAccountId: account.id,
      createdAt: existing.data?.created_at ?? new Date().toISOString(),
    },
  }
}

/**
 * Crea l'account centrale minimo per un cliente che usa solo un prodotto
 * satellite. Non crea una property HotelAccelerator, non abilita moduli e non
 * concede SSO: registra esclusivamente l'identita' necessaria al codice cliente.
 */
async function createStandaloneCustomerAccount(input: {
  productKey: SuiteProductKey
  externalTenantId: string
}): Promise<CustomerAccount> {
  const product = getSuiteProduct(input.productKey)
  if (!product) throw new Error("invalid suite product")

  const supabase = createServiceClient()
  const created = await supabase
    .from("customer_accounts")
    .insert({ property_id: null })
    .select("id, property_id, account_number")
    .single()

  if (created.error || !created.data) throw created.error ?? new Error("customer account creation failed")

  const linkInsert = await supabase.from("suite_tenant_links").insert({
    customer_account_id: created.data.id,
    product_key: product.key,
    external_tenant_id: input.externalTenantId,
    created_by_user_id: null,
  })

  if (!linkInsert.error) return created.data as CustomerAccount

  // Se due richieste arrivano insieme, solo una puo' vincere il vincolo
  // (product_key, external_tenant_id). Eliminiamo l'account rimasto orfano e
  // riutilizziamo quello creato dalla richiesta vincente.
  const cleanup = await supabase.from("customer_accounts").delete().eq("id", created.data.id)
  if (cleanup.error) {
    console.error("[customer-code-registry] standalone account cleanup failed", {
      account_id: created.data.id,
      error: cleanup.error.message,
    })
  }

  if (linkInsert.error.code !== "23505") throw linkInsert.error

  const racedLink = await supabase
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", product.key)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()

  if (racedLink.error) throw racedLink.error
  if (!racedLink.data) throw linkInsert.error

  const racedAccount = await getCustomerAccountById(racedLink.data.customer_account_id)
  if (!racedAccount) throw new Error("standalone customer account missing after link race")
  return racedAccount
}

/** Risoluzione usata solo dal server del prodotto satellite autenticato. */
export async function resolveExternalTenantCode(input: {
  productKey: SuiteProductKey
  externalTenantId: string
}): Promise<CustomerProductCode | null> {
  const product = getSuiteProduct(input.productKey)
  if (!product) return null

  const supabase = createServiceClient()
  const link = await supabase
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", product.key)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()

  if (link.error) throw link.error

  const account = link.data
    ? await getCustomerAccountById(link.data.customer_account_id)
    : await createStandaloneCustomerAccount({
        productKey: product.key,
        externalTenantId: input.externalTenantId,
      })

  if (!account) return null
  return getOrCreateCustomerProductCodeForAccount(account.id, product.key)
}
