import { redirect } from "next/navigation"

// Login unificato: la vecchia login super admin reindirizza alla login unica.
// La destinazione post-login (admin vs super admin) è decisa dai permessi
// (authorizeUser), non dalla route di ingresso.
export default function SuperAdminLoginPage() {
  redirect("/admin")
}
