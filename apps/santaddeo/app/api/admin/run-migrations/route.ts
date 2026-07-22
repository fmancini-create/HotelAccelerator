import { NextResponse } from "next/server"
import { migrations } from "@/lib/migrations"
import { createClient } from "@supabase/supabase-js"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/admin/run-migrations
 * Runs pending migrations on the specified database (or both).
 * Query param: ?target=dev|prod|both (default: both)
 *
 * BUG FIX 30/04/2026: prima era POST pubblico. Chiunque poteva eseguire
 * tutte le migration (incluse quelle che modificano lo schema PROD) e la
 * funzione exec_sql che permette SQL arbitrario. Ora richiede super_admin.
 */
export async function POST(request: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const target = searchParams.get("target") || "both"
  
  const results: Record<string, { applied: string[]; skipped: string[]; errors: string[] }> = {}

  // PROD
  if (target === "prod" || target === "both") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      results.prod = await applyMigrations(url, key, "PROD")
    } else {
      results.prod = { applied: [], skipped: [], errors: ["Missing PROD env vars"] }
    }
  }

  // DEV - same env var names as lib/supabase/server.ts
  if (target === "dev" || target === "both") {
    const url = process.env.DEV_SUPABASE_URL || "https://dshdmkmhhbjractpvojp.supabase.co"
    const key = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      results.dev = await applyMigrations(url, key, "DEV")
    } else {
      results.dev = { applied: [], skipped: [], errors: ["Missing DEV env vars"] }
    }
  }

  return NextResponse.json({ results })
}

async function applyMigrations(
  supabaseUrl: string,
  serviceRoleKey: string,
  label: string
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const applied: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  // Step 1: Ensure _migrations table exists
  // We use a direct SQL approach via PostgREST SQL endpoint
  const createTrackingTable = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      description TEXT,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `
  
  // Try to execute SQL via the Supabase SQL endpoint
  const sqlRes = await executeSql(supabaseUrl, serviceRoleKey, createTrackingTable)
  if (!sqlRes.ok) {
    console.log(`[Migration] ${label}: Could not create _migrations table:`, sqlRes.error)
    // Try to continue anyway - maybe table already exists
  }

  // Step 2: Get already applied migrations
  let appliedIds = new Set<string>()
  const { data: existingMigrations, error: fetchError } = await supabase
    .from("_migrations")
    .select("id")
  
  if (!fetchError && existingMigrations) {
    appliedIds = new Set(existingMigrations.map((r: { id: string }) => r.id))
    console.log(`[Migration] ${label}: ${appliedIds.size} migrations already applied`)
  } else {
    console.log(`[Migration] ${label}: Could not fetch existing migrations:`, fetchError?.message)
  }

  // Step 3: Apply pending migrations
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      skipped.push(migration.id)
      continue
    }

    console.log(`[Migration] ${label}: Applying ${migration.id} - ${migration.description}`)
    
    const result = await executeSql(supabaseUrl, serviceRoleKey, migration.sql)
    
    if (result.ok) {
      // Record as applied
      await supabase.from("_migrations").insert({
        id: migration.id,
        description: migration.description,
      })
      applied.push(migration.id)
      console.log(`[Migration] ${label}: Applied ${migration.id}`)
    } else {
      // Check if it's a "already exists" type error - treat as success
      if (result.error?.includes("already exists") || result.error?.includes("duplicate")) {
        await supabase.from("_migrations").insert({
          id: migration.id,
          description: migration.description,
        })
        skipped.push(migration.id)
        console.log(`[Migration] ${label}: Skipped ${migration.id} (already exists)`)
      } else {
        errors.push(`${migration.id}: ${result.error}`)
        console.error(`[Migration] ${label}: Failed ${migration.id}:`, result.error)
      }
    }
  }

  // Reload PostgREST schema cache
  await executeSql(supabaseUrl, serviceRoleKey, "NOTIFY pgrst, 'reload schema';")

  return { applied, skipped, errors }
}

/**
 * Execute raw SQL on Supabase using the pg_net/management API
 * Uses the Supabase Management API SQL endpoint
 */
async function executeSql(
  supabaseUrl: string,
  serviceRoleKey: string,
  sql: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Method: Use Supabase's built-in pg functions via PostgREST
    // We call a helper function that executes arbitrary SQL
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    })

    // Try using the exec_sql RPC function
    const { error } = await supabase.rpc("exec_sql", { query: sql })
    
    if (error) {
      // If exec_sql doesn't exist, we need to create it first
      if (error.message?.includes("function") && error.message?.includes("does not exist")) {
        return { ok: false, error: "exec_sql function not found. Run the bootstrap SQL on this database." }
      }
      return { ok: false, error: error.message }
    }
    
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}
