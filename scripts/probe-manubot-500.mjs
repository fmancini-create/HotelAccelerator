// Sonda usa-e-getta: mostra il CORPO del 500 di /api/admin/manubot/setup
// chiamato con una sessione admin valida. Serve a capire la causa reale
// invece di indovinarla. Pulisce tutto quello che crea.
import { createClient } from "@supabase/supabase-js"

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERV = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = "http://localhost:3000"
const HOST = "www.hotelaccelerator.com"

const admin = createClient(URL_SB, SERV, { auth: { persistSession: false } })
const marca = `probe${Date.now().toString(36)}`

let tenant = null
let utente = null

try {
  const { data: t, error: et } = await admin
    .from("properties")
    .insert({ name: `PROBE ${marca}`, slug: `probe-${marca}`, is_active: true, plan: "free" })
    .select("id")
    .single()
  if (et) throw new Error(et.message)
  tenant = t.id

  const email = `probe-${marca}@example.invalid`
  const password = `Pb!${marca}!x9`
  const { data: u, error: eu } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (eu) throw new Error(eu.message)
  utente = u.user.id

  await admin.from("admin_users").insert({
    id: utente,
    email,
    name: "Probe",
    property_id: tenant,
    role: "admin",
    is_tenant_admin: true,
  })

  const pubblico = createClient(URL_SB, ANON, { auth: { persistSession: false } })
  const { data: s } = await pubblico.auth.signInWithPassword({ email, password })

  const r = await fetch(`${BASE}/api/admin/manubot/setup`, {
    headers: {
      Host: HOST,
      "x-forwarded-host": HOST,
      Authorization: `Bearer ${s.session.access_token}`,
    },
  })
  console.log("stato:", r.status)
  console.log("corpo:", (await r.text()).slice(0, 1200))
} finally {
  if (utente) {
    await admin.from("admin_users").delete().eq("id", utente)
    await admin.auth.admin.deleteUser(utente).catch(() => {})
  }
  if (tenant) await admin.from("properties").delete().eq("id", tenant)
  const { count } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .like("slug", `probe-${marca}%`)
  console.log("pulizia, residui:", count ?? "?")
}
