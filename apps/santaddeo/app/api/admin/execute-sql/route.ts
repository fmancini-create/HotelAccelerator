import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden - Super Admin only" }, { status: 403 })
    }

    const { scriptName } = await request.json()

    console.log("[v0] Executing SQL script:", scriptName)

    let sqlStatements: string[] = []

    if (scriptName === "025_migrate_roles_simple") {
      sqlStatements = [
        "UPDATE profiles SET role = 'super_admin' WHERE role = 'superadmin'",
        "UPDATE profiles SET role = 'property_admin' WHERE role IN ('admin', 'manager')",
        "UPDATE profiles SET role = 'sub_user' WHERE role = 'viewer'",
        "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check",
        "ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'property_admin', 'consultant', 'sub_user'))",
      ]
    } else if (scriptName === "016_add_cancellation_columns") {
      sqlStatements = [
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_date DATE",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_datetime TIMESTAMPTZ",
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT",
        "CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_date ON bookings(hotel_id, cancellation_date) WHERE cancellation_date IS NOT NULL",
      ]
    } else if (scriptName === "017_create_sync_jobs_table") {
      sqlStatements = [
        `CREATE TABLE IF NOT EXISTS sync_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
          pms_integration_id UUID REFERENCES pms_integrations(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          error_message TEXT,
          stats JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_by UUID REFERENCES profiles(id)
        )`,
        "CREATE INDEX IF NOT EXISTS idx_sync_jobs_hotel_id ON sync_jobs(hotel_id)",
        "CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status)",
        "CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at DESC)",
        "ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY",
        'DROP POLICY IF EXISTS "Users can view sync jobs for their hotels" ON sync_jobs',
        `CREATE POLICY "Users can view sync jobs for their hotels"
          ON sync_jobs FOR SELECT
          USING (
            hotel_id IN (
              SELECT h.id FROM hotels h
              JOIN profiles p ON p.organization_id = h.organization_id
              WHERE p.id = auth.uid()
            )
          )`,
        'DROP POLICY IF EXISTS "Users can create sync jobs for their hotels" ON sync_jobs',
        `CREATE POLICY "Users can create sync jobs for their hotels"
          ON sync_jobs FOR INSERT
          WITH CHECK (
            hotel_id IN (
              SELECT h.id FROM hotels h
              JOIN profiles p ON p.organization_id = h.organization_id
              WHERE p.id = auth.uid()
            )
          )`,
        'DROP POLICY IF EXISTS "System can update sync jobs" ON sync_jobs',
        `CREATE POLICY "System can update sync jobs"
          ON sync_jobs FOR UPDATE
          USING (true)`,
      ]
    } else if (scriptName === "024_align_architecture_with_requirements") {
      sqlStatements = [
        // Create bookings_full table for historical data
        `CREATE TABLE IF NOT EXISTS bookings_full (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
          booking_id TEXT NOT NULL,
          guest_name TEXT,
          check_in DATE NOT NULL,
          check_out DATE NOT NULL,
          room_type TEXT,
          rate DECIMAL(10,2),
          status TEXT,
          source TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(hotel_id, booking_id)
        )`,
        "CREATE INDEX IF NOT EXISTS idx_bookings_full_hotel_dates ON bookings_full(hotel_id, check_in, check_out)",
        "ALTER TABLE bookings_full ENABLE ROW LEVEL SECURITY",

        // Create user_property_map table
        `CREATE TABLE IF NOT EXISTS user_property_map (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('property_admin', 'consultant', 'sub_user')),
          permissions JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, hotel_id)
        )`,
        "CREATE INDEX IF NOT EXISTS idx_user_property_map_user ON user_property_map(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_property_map_hotel ON user_property_map(hotel_id)",
        "ALTER TABLE user_property_map ENABLE ROW LEVEL SECURITY",

        // Create consultant_kpi table
        `CREATE TABLE IF NOT EXISTS consultant_kpi (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          consultant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          revenue_increase DECIMAL(10,2),
          occupancy_improvement DECIMAL(5,2),
          adr_improvement DECIMAL(10,2),
          revpar_improvement DECIMAL(10,2),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(consultant_id, hotel_id, period_start)
        )`,
        "CREATE INDEX IF NOT EXISTS idx_consultant_kpi_consultant ON consultant_kpi(consultant_id)",
        "CREATE INDEX IF NOT EXISTS idx_consultant_kpi_hotel ON consultant_kpi(hotel_id)",
        "ALTER TABLE consultant_kpi ENABLE ROW LEVEL SECURITY",

        // Add sync flags to sync_jobs if not exists
        "ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS sync_type TEXT CHECK (sync_type IN ('initial', 'incremental', 'hard_resync')) DEFAULT 'incremental'",
        "ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE",

        // Add frozen flag to bookings
        "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE",
        "CREATE INDEX IF NOT EXISTS idx_bookings_frozen ON bookings(hotel_id, is_frozen) WHERE is_frozen = TRUE",
      ]
    } else {
      return NextResponse.json({ error: "Unknown script" }, { status: 400 })
    }

    console.log("[v0] Executing", sqlStatements.length, "SQL statements")

    const errors: string[] = []
    const successes: string[] = []

    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i]
      const preview = statement.substring(0, 80).replace(/\s+/g, " ")
      console.log(`[v0] Statement ${i + 1}/${sqlStatements.length}: ${preview}...`)

      try {
        // Use the Supabase client to execute raw SQL via the REST API
        // Note: This requires the statement to be a valid PostgreSQL query
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY || "",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ query: statement }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          console.error(`[v0] Error in statement ${i + 1}:`, errorData)
          errors.push(`Statement ${i + 1} (${preview}...): ${errorData.message || "Unknown error"}`)
        } else {
          console.log(`[v0] Statement ${i + 1} executed successfully`)
          successes.push(`Statement ${i + 1}: Success`)
        }
      } catch (err: any) {
        console.error(`[v0] Exception in statement ${i + 1}:`, err.message)
        errors.push(`Statement ${i + 1} (${preview}...): ${err.message}`)
      }
    }

    console.log(`[v0] Execution complete: ${successes.length} succeeded, ${errors.length} failed`)

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Script executed with ${errors.length} error(s). ${successes.length}/${sqlStatements.length} statements succeeded.`,
          errors: errors,
          successes: successes,
        },
        { status: 207 },
      )
    }

    return NextResponse.json({
      success: true,
      message: `Script ${scriptName} executed successfully (${successes.length} statements)`,
      successes: successes,
    })
  } catch (error: any) {
    console.error("[v0] Execute SQL error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to execute SQL",
      },
      { status: 500 },
    )
  }
}
