import { createClient } from "@supabase/supabase-js"

// Sonda temporanea: crea un cookie di sessione per guardare le pagine riservate.
// Da rimuovere alla fine della verifica.
const url = process.env.SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const email = process.env.MANUBOT_DEFAULT_EMAIL
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
if (error) {
  console.log("ERR generateLink: " + error.message)
  process.exit(1)
}
const pub = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
// Con token_hash NON va passata l'email: il gettone la contiene gia'.
const v = await pub.auth.verifyOtp({ type: "email", token_hash: data.properties.hashed_token })
if (v.error) {
  console.log("ERR verifyOtp: " + v.error.message)
  process.exit(1)
}
const s = v.data.session
const ref = new URL(url).hostname.split(".")[0]
// Minimo indispensabile: il server rivalida il gettone, quindi "user" nel cookie
// non e' attendibile e va omesso per stare sotto il limite di dimensione.
const val = JSON.stringify({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  token_type: "bearer",
})
console.log("NAME=sb-" + ref + "-auth-token")
console.log("LEN=" + val.length)
console.log("VALUE=base64-" + Buffer.from(val).toString("base64"))
