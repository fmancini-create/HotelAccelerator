import { createClient } from "@supabase/supabase-js"
import { migrations } from "./index"

/**
 * Run all pending migrations on a given Supabase database.
 * Returns { applied: string[], skipped: string[], errors: string[] }
 */
export async function runMigrations(
  supabaseUrl: string,
  serviceRoleKey: string,
  label: string = "DB"
): Promise<{ applied: string[]; skipped: string[]; errors: string[] }> {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const applied: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  // First migration creates the _migrations table, always run it via rpc
  const firstMigration = migrations[0]
  if (firstMigration) {
    try {
      // Use raw SQL via rpc if available, otherwise just try to create
      const { error } = await client.rpc("exec_sql", { query: firstMigration.sql })
      if (error) {
        // rpc might not exist, try creating the table directly
        const { error: createError } = await client
          .from("_migrations")
          .select("id")
          .limit(1)
        
        if (createError?.code === "42P01") {
          // Table doesn't exist - we need exec_sql or direct SQL access
          // Create it by attempting an insert that will auto-create via PostgREST... 
          // This won't work. We need the table to exist first.
          // Fall back: use the REST API to create via SQL
          console.log(`[Migration] ${label}: _migrations table doesn't exist, creating via fetch...`)
          
          const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ query: firstMigration.sql }),
          })
          
          if (!res.ok) {
            // Last resort: create table using the Supabase management API won't work
            // We'll just try each migration and track manually
            console.log(`[Migration] ${label}: Cannot create _migrations table via RPC, will track in memory`)
          }
        }
      }
    } catch {
      // Ignore - we'll handle tracking below
    }
  }

  // Check which migrations have already been applied
  let appliedIds = new Set<string>()
  try {
    const { data } = await client
      .from("_migrations")
      .select("id")
    
    if (data) {
      appliedIds = new Set(data.map((r: { id: string }) => r.id))
    }
  } catch {
    // _migrations table might not exist yet
  }

  // Run each migration in order
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) {
      skipped.push(migration.id)
      continue
    }

    console.log(`[Migration] ${label}: Applying ${migration.id} - ${migration.description}`)
    
    try {
      // Execute migration SQL via RPC
      const { error } = await client.rpc("exec_sql", { query: migration.sql })
      
      if (error) {
        // Try via direct fetch
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ query: migration.sql }),
        })
        
        if (!res.ok) {
          const errText = await res.text()
          console.error(`[Migration] ${label}: Failed ${migration.id}:`, errText)
          errors.push(`${migration.id}: ${errText}`)
          continue
        }
      }

      // Record migration as applied
      try {
        await client.from("_migrations").insert({ 
          id: migration.id, 
          description: migration.description 
        })
      } catch {
        // Tracking table might not exist
      }
      
      applied.push(migration.id)
      console.log(`[Migration] ${label}: Applied ${migration.id}`)
    } catch (err: any) {
      console.error(`[Migration] ${label}: Error ${migration.id}:`, err.message)
      errors.push(`${migration.id}: ${err.message}`)
    }
  }

  return { applied, skipped, errors }
}

/**
 * Run migrations on both PROD and DEV databases
 */
export async function runMigrationsOnBothDatabases() {
  const results: Record<string, { applied: string[]; skipped: string[]; errors: string[] }> = {}

  // PROD
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SANTADDEO_SUPABASE_URL
  const prodKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (prodUrl && prodKey) {
    results.prod = await runMigrations(prodUrl, prodKey, "PROD")
  }

  // DEV - use same env var names as lib/supabase/server.ts
  const devUrl = process.env.DEV_SUPABASE_URL || "https://dshdmkmhhbjractpvojp.supabase.co"
  const devKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY
  if (!devKey) {
    throw new Error(
      "DEV_SUPABASE_SERVICE_ROLE_KEY non configurata. " +
      "Aggiungila a .env.development.local per eseguire le migrations."
    )
  }
  if (devUrl && devKey) {
    results.dev = await runMigrations(devUrl, devKey, "DEV")
  }

  return results
}
