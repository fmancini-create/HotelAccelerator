import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { VariableRequestsClient } from "@/components/superadmin/variable-requests-client"

export const dynamic = "force-dynamic"

export default async function VariableRequestsPage() {
  const isV0Preview = await isDevAuthAsync()
  const supabase = await createClient()

  let user: any = null
  if (isV0Preview) {
    user = { id: "5de43b7b-e661-4e4e-8177-7943df06470c", email: "f.mancini@4bid.it" }
  } else {
    const { data: { user: authUser }, error } = await supabase.auth.getUser()
    if (error || !authUser) redirect("/auth/login")
    user = authUser
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  const isSuperAdmin =
    profile?.role === "super_admin" || profile?.role === "superadmin"
  if (!isV0Preview && !isSuperAdmin) redirect("/dashboard")

  // Initial server fetch so the page renders fast; the client will refetch
  // after status changes via SWR.
  const { data: initialRequests } = await supabase
    .from("pricing_variable_requests")
    .select(
      `
      id, hotel_id, requested_by, proposed_name, description, datasource,
      frequency, format, rationale, status, reviewed_by, review_notes,
      reviewed_at, created_at, updated_at,
      hotels:hotel_id ( name ),
      requester:profiles!pricing_variable_requests_requested_by_fkey ( email, full_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Richieste variabili K custom</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Valuta le richieste dei tenant per nuove variabili nel motore di
          pricing K-driven. Le variabili approvate vanno poi seedate
          manualmente in <code>pricing_variables</code> con la pipeline
          definita.
        </p>
      </div>
      {/* Cast required: Supabase's typed select with embedded resources may
          return an array even for one-to-one FK joins; the client normalizes
          the shape via SWR right after mount. */}
      <VariableRequestsClient initialRequests={(initialRequests ?? []) as any} />
    </div>
  )
}
