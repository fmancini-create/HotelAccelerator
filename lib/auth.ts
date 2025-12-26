import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

/**
 * Logs out the current user and redirects to login page
 */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

/**
 * Gets the currently authenticated user
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Checks if user is authenticated
 */
export async function isAuthenticated() {
  const user = await getCurrentUser()
  return !!user
}
