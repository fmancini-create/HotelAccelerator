import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { getSuiteProduct, type SuiteProductKey } from "@/lib/customer-codes/product"

export interface CustomerProductCode {
  code: string
  productKey: SuiteProductKey
}

interface CustomerAccount {
  id: string
  property_id: string
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

/**
 * Restituisce il codice di un prodotto per un account di suite. La generazione
 * e' idempotente: il database compone codice e prefisso a partire dal numero
 * centrale, senza affidarsi a logica duplicata nell'applicazione.
 */
export async function getOrCreateCustomerProductCode(
  propertyId: string,
  productKey: SuiteProductKey,
): Promise<CustomerProductCode | null> {
  const product = getSuiteProduct(productKey)
  if (!product) return null

  const account = await getCustomerAccount(propertyId)
  if (!account) return null

  const supabase = createServiceClient()
  const existing = await supabase
    .from("customer_product_codes")
    .select("code, product_key")
    .eq("customer_account_id", account.id)
    .eq("product_key", product.key)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (existing.data) return { code: existing.data.code, productKey: existing.data.product_key as SuiteProductKey }

  const created = await supabase
    .from("customer_product_codes")
    .insert({ customer_account_id: account.id, product_key: product.key })
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
    .eq("customer_account_id", account.id)
    .eq("product_key", product.key)
    .maybeSingle()

  if (raced.error) throw created.error ?? raced.error
  if (!raced.data) throw created.error
  return { code: raced.data.code, productKey: raced.data.product_key as SuiteProductKey }
}

export async function findCustomerProductCode(code: string, productKey: SuiteProductKey): Promise<{
  propertyId: string
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

  const code = await getOrCreateCustomerProductCode(input.propertyId, product.key)
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

/** Risoluzione usata solo dal server del prodotto satellite autenticato. */
export async function resolveExternalTenantCode(input: {
  productKey: SuiteProductKey
  externalTenantId: string
}): Promise<CustomerProductCode | null> {
  const supabase = createServiceClient()
  const link = await supabase
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", input.productKey)
    .eq("external_tenant_id", input.externalTenantId)
    .maybeSingle()

  if (link.error) throw link.error
  if (!link.data) return null

  const account = await supabase
    .from("customer_accounts")
    .select("property_id")
    .eq("id", link.data.customer_account_id)
    .maybeSingle()

  if (account.error) throw account.error
  if (!account.data) return null
  return getOrCreateCustomerProductCode(account.data.property_id, input.productKey)
}
