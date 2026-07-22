import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { TeamManagement } from "@/components/settings/team-management"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Info } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function UsersSettingsPage() {
  const settingsData = await getSettingsData()

  if (settingsData.redirect) {
    redirect(settingsData.redirect)
  }

  const { profile, selectedHotel, hotels, isSuperAdmin } = settingsData

  if (!selectedHotel) {
    redirect(isSuperAdmin ? "/superadmin" : "/onboarding")
  }

  const supabaseAdmin = await createClient()

  const canManageTeam = profile.role === "property_admin" || profile.role === "super_admin"

  const { data: subscription } = await supabaseAdmin
    .from("accelerator_subscriptions")
    .select("*")
    .eq("hotel_id", selectedHotel.id)
    .eq("is_active", true)
    .maybeSingle()

  const isBasicPlan = subscription?.plan_type === "basic" || !subscription

  const organizationId = selectedHotel.organization_id
  let teamMembers: any[] = []
  if (organizationId) {
    const { data: teamMembersData } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
    
    // Enrich team members with last_sign_in_at from Supabase Auth Admin API
    const enrichedMembers = []
    try {
      const adminClient = await createServiceRoleClient()
      const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const authUsers = listData?.users || []
      const authMap = new Map<string, string>()
      for (const au of authUsers) {
        if (au.id && au.last_sign_in_at) {
          authMap.set(au.id, au.last_sign_in_at)
        }
      }
      for (const member of teamMembersData || []) {
        const lastSignIn = member.last_login_at || authMap.get(member.id) || null
        enrichedMembers.push({ ...member, last_login_at: lastSignIn })
      }
    } catch {
      // Auth API failed, use profiles data as-is
      for (const member of teamMembersData || []) {
        enrichedMembers.push(member)
      }
    }
    teamMembers = enrichedMembers
  }

  let invitations: any[] = []
  let invitationsTableMissing = false
  let invitationsSchemaError = false

  try {
    const { data: invitationsData, error: invError } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .in("hotel_id", (hotels || []).map((h: any) => h.id))
      .is("accepted_at", null)
      .order("created_at", { ascending: false })

    if (invError) {
      if (invError.code === "42P01" || invError.message?.includes("does not exist")) {
        invitationsTableMissing = true
      } else if (invError.code === "42703") {
        invitationsSchemaError = true
      }
    } else {
      invitations = invitationsData || []
    }
  } catch {
    invitationsTableMissing = true
  }

  const data = {
    user: { id: profile.id },
    profile,
    selectedHotel,
    hotels,
    canManageTeam,
    isBasicPlan,
    teamMembers,
    invitations,
    invitationsTableMissing,
    invitationsSchemaError,
    isSuperAdmin,
  }

  if (data.redirect) {
    redirect(data.redirect)
  }

  return (
    <div className="space-y-6">
      {data.invitationsTableMissing && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            La funzionalità di inviti utente richiede l'esecuzione dello script di migrazione
            015_add_user_invitations.sql
          </AlertDescription>
        </Alert>
      )}

      {data.invitationsSchemaError && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            La tabella user_invitations ha uno schema obsoleto. Esegui lo script di migrazione
            016_fix_user_invitations_schema.sql per aggiornarlo.
          </AlertDescription>
        </Alert>
      )}

      {data.isBasicPlan && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            La gestione del team è disponibile solo con i piani Professional ed Enterprise. Aggiorna il tuo piano per
            invitare membri del team.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Membri del Team</CardTitle>
          <CardDescription>Gestisci i permessi e invita nuovi collaboratori</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamManagement
            hotelId={data.selectedHotel.id}
            teamMembers={data.teamMembers || []}
            invitations={data.invitations}
            canManageTeam={data.canManageTeam}
            isBasicPlan={data.isBasicPlan}
            currentUserId={data.user.id}
          />
        </CardContent>
      </Card>
    </div>
  )
}
