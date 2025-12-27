"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

/**
 * Logout function - signs out the user and redirects to login
 */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/admin")
}

/**
 * Logout for super admin - signs out and redirects to super admin login
 */
export async function logoutSuperAdmin() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/super-admin/login")
}
