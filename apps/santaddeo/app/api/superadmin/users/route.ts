import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getPublicSupabaseConfig } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// GET - List all users with their profiles, organizations, and hotel associations
export async function GET(request: NextRequest) {
  try {
    const isV0Preview = await isDevAuthAsync()
    const supabase = await createServiceRoleClient()

    if (!isV0Preview) {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

      if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    console.log("[v0] SuperAdmin Users - profiles count:", profiles?.length || 0, "error:", profilesError?.message || "none")

    if (profilesError) {
      console.error("[SuperAdmin Users] Error fetching profiles:", profilesError)
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    // Fetch all organizations
    const { data: organizations } = await supabase.from("organizations").select("id, name")

    // Fetch all hotels
    const { data: hotels } = await supabase.from("hotels").select("id, name, organization_id").is("deleted_at", null)

    // Fetch hotel_users associations for each user
    const { data: hotelUsersData } = await supabase
      .from("hotel_users")
      .select("user_id, hotel_id")

    // Build user -> hotel_id map (first hotel association per user)
    const userHotelMap = new Map<string, string>()
    for (const hu of hotelUsersData || []) {
      if (!userHotelMap.has(hu.user_id)) {
        userHotelMap.set(hu.user_id, hu.hotel_id)
      }
    }

    // Fetch auth users for last_sign_in_at (= "Ultimo accesso" / log accessi).
    //
    // FIX 31/05/2026: prima la URL veniva letta da
    // `process.env.SUPABASE_URL || process.env.SANTADDEO_SUPABASE_URL`, env var
    // che NON esistono in questo progetto (il resto dell'app usa
    // NEXT_PUBLIC_SUPABASE_URL con fallback hardcoded a PROD_URL). Risultato:
    // `supabaseUrl` undefined -> guard sotto sempre falso -> fetch saltato ->
    // last_sign_in_at = null per TUTTI -> colonna "Ultimo accesso" sempre "Mai"
    // e stat "Login Effettuato" sempre 0, anche per utenti che hanno fatto
    // login davvero. Ora usiamo getPublicSupabaseConfig().url (sempre risolto).
    //
    // NOTA paginazione: l'admin API e' limitata a per_page elementi per pagina.
    // Paginiamo finche' una pagina torna < per_page, cosi' non tronchiamo
    // silenziosamente quando gli utenti superano la prima pagina.
    let authUsers: any[] = []
    try {
      const { url: supabaseUrl } = getPublicSupabaseConfig()
      const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceRoleKey) {
        const perPage = 1000
        for (let page = 1; page <= 50; page++) {
          const res = await fetch(
            `${supabaseUrl}/auth/v1/admin/users?per_page=${perPage}&page=${page}`,
            {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
              },
            },
          )
          if (!res.ok) {
            console.warn("[SuperAdmin Users] auth admin API non ok:", res.status)
            break
          }
          const data = await res.json()
          const batch = data.users || []
          authUsers.push(...batch)
          if (batch.length < perPage) break
        }
      } else {
        console.warn("[SuperAdmin Users] URL o service key mancante: last_sign_in_at non disponibile")
      }
    } catch (e) {
      console.warn("[SuperAdmin Users] Could not fetch auth users:", e)
    }

    // Build auth users map
    const authMap = new Map<string, any>()
    for (const au of authUsers) {
      authMap.set(au.id, au)
    }

    // Build org map
    const orgMap = new Map<string, string>()
    for (const org of organizations || []) {
      orgMap.set(org.id, org.name)
    }

    // Build hotel-by-org map
    const hotelsByOrg = new Map<string, Array<{ id: string; name: string }>>()
    for (const h of hotels || []) {
      if (!hotelsByOrg.has(h.organization_id)) {
        hotelsByOrg.set(h.organization_id, [])
      }
      hotelsByOrg.get(h.organization_id)!.push({ id: h.id, name: h.name })
    }

    // Fetch pending invitations (not yet accepted)
    const { data: invitations } = await supabase
      .from("user_invitations")
      .select("*")
      .is("accepted_at", null)
      .order("created_at", { ascending: false })

    // Merge data
    const users = (profiles || []).map((p: any) => {
      const authUser = authMap.get(p.id)
      return {
        id: p.id,
        email: p.email || authUser?.email || "N/A",
        first_name: p.first_name,
        last_name: p.last_name,
        phone: p.phone || null,
        mobile: p.mobile || null,
        job_title: p.job_title || null,
        role: p.role,
        organization_id: p.organization_id,
        organization_name: p.organization_id ? orgMap.get(p.organization_id) || "N/A" : null,
        hotels: p.organization_id ? hotelsByOrg.get(p.organization_id) || [] : [],
        hotel_id: userHotelMap.get(p.id) || null,
        created_at: p.created_at,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        email_confirmed_at: authUser?.email_confirmed_at || null,
        is_active: p.is_active !== false,
        // La colonna reale in profiles e' `setup_completed` (non
        // `onboarding_completed`): prima leggevamo un campo inesistente,
        // quindi il flag risultava SEMPRE false per tutti gli utenti.
        onboarding_completed: p.setup_completed === true,
        is_invitation: false,
      }
    })

    // Build invitation entries (only those whose email is NOT already in profiles)
    const profileEmails = new Set((profiles || []).map((p: any) => (p.email || "").toLowerCase()))
    const pendingInvitations = (invitations || [])
      .filter((inv: any) => !profileEmails.has(inv.email.toLowerCase()))
      .map((inv: any) => ({
        id: `inv_${inv.id}`,
        invitation_id: inv.id,
        email: inv.email,
        first_name: inv.first_name || null,
        last_name: inv.last_name || null,
        role: inv.role,
        organization_id: inv.organization_id,
        organization_name: inv.organization_id ? orgMap.get(inv.organization_id) || "N/A" : null,
        hotels: inv.hotel_name ? [{ id: inv.hotel_id, name: inv.hotel_name }] : [],
        created_at: inv.created_at,
        last_sign_in_at: null,
        email_confirmed_at: null,
        is_active: false,
        onboarding_completed: false,
        is_invitation: true,
        invitation_expires_at: inv.expires_at,
        invitation_hotel_id: inv.hotel_id,
        invitation_hotel_name: inv.hotel_name,
        invited_by_name: inv.invited_by_name,
      }))

    return NextResponse.json({
      users: [...users, ...pendingInvitations],
      organizations: organizations || [],
      hotels: hotels || [],
    })
  } catch (error) {
    console.error("[SuperAdmin Users] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Remove user (soft or permanent)
export async function DELETE(request: NextRequest) {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { user_ids, permanent = false } = body

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json({ error: "user_ids obbligatorio" }, { status: 400 })
    }

    // Never allow deleting yourself
    if (user_ids.includes(user.id)) {
      return NextResponse.json({ error: "Non puoi eliminare te stesso" }, { status: 400 })
    }

    const results: { id: string; success: boolean; error?: string }[] = []

    for (const uid of user_ids) {
      try {
        // Handle invitation entries (prefixed with inv_)
        if (uid.startsWith("inv_")) {
          const invId = uid.replace("inv_", "")
          await supabase.from("user_invitations").delete().eq("id", invId)
          results.push({ id: uid, success: true })
          continue
        }

        if (permanent) {
          // 1. Delete profile data
          await supabase.from("profiles").delete().eq("id", uid)
          // 2. Delete from Supabase Auth (requires service role)
          // FIX 31/05/2026: stesse env inesistenti del GET -> prima la
          // cancellazione da Auth veniva silenziosamente SALTATA (il profilo
          // spariva ma l'utente auth restava, riusabile per login). Ora usiamo
          // getPublicSupabaseConfig().url.
          const { url: supabaseUrl } = getPublicSupabaseConfig()
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
          if (supabaseUrl && serviceRoleKey) {
            const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
              method: "DELETE",
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
              },
            })
            if (!res.ok) {
              const err = await res.json()
              throw new Error(err.message || "Errore eliminazione auth")
            }
          }
        } else {
          // Soft delete: disable account
          await supabase.from("profiles").update({ is_active: false }).eq("id", uid)
        }
        results.push({ id: uid, success: true })
      } catch (e: any) {
        results.push({ id: uid, success: false, error: e.message })
      }
    }

    const failed = results.filter(r => !r.success)
    return NextResponse.json({
      success: failed.length === 0,
      deleted: results.filter(r => r.success).length,
      failed: failed.length,
      results,
    })
  } catch (error) {
    console.error("[SuperAdmin Users DELETE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - Update user role or organization
export async function PATCH(request: NextRequest) {
  try {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      user_id,
      role,
      organization_id,
      hotel_id,
      // Dati anagrafici/contatto modificabili dal Super Admin
      first_name,
      last_name,
      email,
      phone,
      mobile,
      job_title,
    } = body

    if (!user_id) {
      return NextResponse.json({ error: "user_id obbligatorio" }, { status: 400 })
    }

    // Stato precedente del profilo: serve per sapere se stiamo entrando o
    // uscendo dal ruolo "sales_agent" (venditore) e per copiare email/nome
    // nella riga sales_agents.
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role")
      .eq("id", user_id)
      .maybeSingle()
    const previousRole = targetProfile?.role || null

    const updateData: any = {}
    if (role) {
      const allowedRoles = ["user", "sub_user", "property_admin", "consultant", "sales_agent", "super_admin"]
      if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: `Ruolo non valido. Ruoli ammessi: ${allowedRoles.join(", ")}` }, { status: 400 })
      }
      updateData.role = role
    }

    if (organization_id !== undefined) {
      updateData.organization_id = organization_id || null
    }

    // Dati anagrafici/contatto: il Super Admin ha controllo completo.
    // Stringa vuota -> null (per non lasciare "" nei campi opzionali).
    if (first_name !== undefined) updateData.first_name = (first_name || "").trim() || null
    if (last_name !== undefined) updateData.last_name = (last_name || "").trim() || null
    if (phone !== undefined) updateData.phone = (phone || "").trim() || null
    if (mobile !== undefined) updateData.mobile = (mobile || "").trim() || null
    if (job_title !== undefined) updateData.job_title = (job_title || "").trim() || null

    // ─── Cambio email ──────────────────────────────────────────────────────
    // L'email vive sia in profiles.email sia in Supabase Auth. Va aggiornata
    // in ENTRAMBI i posti, altrimenti login (auth) e visualizzazione (profilo)
    // divergono. L'update su Auth richiede l'admin API + service role.
    const newEmail = typeof email === "string" ? email.trim().toLowerCase() : undefined
    if (newEmail !== undefined && newEmail.length > 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return NextResponse.json({ error: "Email non valida" }, { status: 400 })
      }
      const { url: supabaseUrl } = getPublicSupabaseConfig()
      const serviceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceRoleKey) {
        const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
          method: "PUT",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          // email_confirm: true -> l'email risulta gia' confermata, niente
          // mail di verifica (e' un'azione amministrativa).
          body: JSON.stringify({ email: newEmail, email_confirm: true }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          return NextResponse.json(
            { error: "Errore aggiornamento email su Auth: " + (err.msg || err.message || res.status) },
            { status: 400 },
          )
        }
      }
      // Allinea anche profiles.email
      updateData.email = newEmail
    }

    const { data: updatedProfile, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user_id)
      .select()
      .single()

    if (error) {
      console.error("[SuperAdmin Users] Error updating user:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ─── Sincronizza il profilo Venditore (sales_agents) ───────────────────
    // "Venditore" = profiles.role 'sales_agent' + una riga attiva in
    // sales_agents. Cambiando ruolo da Superadmin > Utenti dobbiamo quindi
    // creare/riattivare o disattivare quella riga, altrimenti l'utente
    // verrebbe rediretto su /sales senza avere un agente valido (o resterebbe
    // venditore pur avendo cambiato ruolo).
    let salesAgentWarning: string | null = null
    if (role) {
      if (role === "sales_agent") {
        // Usa i valori AGGIORNATI (se modificati in questo PATCH), con
        // fallback ai valori precedenti del profilo.
        const fullName = [
          updateData.first_name ?? targetProfile?.first_name,
          updateData.last_name ?? targetProfile?.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim()
        const { error: agentErr } = await supabase
          .from("sales_agents")
          .upsert(
            {
              user_id,
              email: updateData.email ?? targetProfile?.email ?? null,
              display_name: fullName || null,
              is_active: true,
            },
            { onConflict: "user_id" },
          )
        if (agentErr) {
          console.error("[SuperAdmin Users] Error upserting sales_agents:", agentErr)
          salesAgentWarning = "Ruolo aggiornato ma errore nella creazione del profilo Venditore: " + agentErr.message
        }
      } else if (previousRole === "sales_agent") {
        // Uscita dal ruolo venditore: disattiva la riga sales_agents (non la
        // elimino, per preservare lo storico commissioni/ledger).
        const { error: deactErr } = await supabase
          .from("sales_agents")
          .update({ is_active: false })
          .eq("user_id", user_id)
        if (deactErr) {
          console.error("[SuperAdmin Users] Error deactivating sales_agents:", deactErr)
          salesAgentWarning = "Ruolo aggiornato ma errore nella disattivazione del profilo Venditore: " + deactErr.message
        }
      }
    }

    // Handle hotel association via hotel_users table
    if (hotel_id !== undefined) {
      // Remove all existing hotel associations for this user
      const { error: deleteError } = await supabase
        .from("hotel_users")
        .delete()
        .eq("user_id", user_id)

      if (deleteError) {
        console.error("[SuperAdmin Users] Error clearing hotel_users:", deleteError)
        // Don't fail the whole request -- profile was already updated
      }

      // If a hotel was selected, insert the new association
      if (hotel_id) {
        const { error: insertError } = await supabase
          .from("hotel_users")
          .insert({
            user_id,
            hotel_id,
            role: role || updatedProfile?.role || "viewer",
          })

        if (insertError) {
          console.error("[SuperAdmin Users] Error inserting hotel_users:", insertError)
          return NextResponse.json({
            success: true,
            profile: updatedProfile,
            warning: "Profilo aggiornato ma errore nell'associazione hotel: " + insertError.message,
          })
        }
      }
    }

    return NextResponse.json({ success: true, profile: updatedProfile, warning: salesAgentWarning || undefined })
  } catch (error) {
    console.error("[SuperAdmin Users] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
