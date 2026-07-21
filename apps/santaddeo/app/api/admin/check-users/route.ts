import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import https from "https"

export async function GET() {
  // BUG FIX 30/04/2026: era GET pubblico che esponeva email/id/createdAt
  // di TUTTI gli utenti registrati al SaaS (data leak GDPR). Super_admin gate.
  const denied = await requireSuperAdmin()
  if (denied) return denied

  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 })
    }

    // Query auth.users table using Supabase Admin API
    const url = new URL(`${supabaseUrl}/auth/v1/admin/users`)

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    }

    const response = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 500,
            data,
          })
        })
      })

      req.on("error", (error) => {
        reject(error)
      })

      req.end()
    })

    if (response.statusCode !== 200) {
      console.error("[v0] Check Users - Error response:", response.data)
      return NextResponse.json(
        { error: "Failed to fetch users", details: response.data },
        { status: response.statusCode },
      )
    }

    const result = JSON.parse(response.data)
    const users = result.users || []

    console.log("[v0] Check Users - Found users:", users.length)

    return NextResponse.json({
      success: true,
      totalUsers: users.length,
      users: users.map((user: any) => ({
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        emailConfirmed: user.email_confirmed_at ? true : false,
      })),
    })
  } catch (error) {
    console.error("[v0] Check Users - Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
