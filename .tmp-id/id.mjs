import { createClient } from "@supabase/supabase-js"
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await db.from("admin_users").select("id,email,is_tenant_admin").limit(60)
const u = (data||[]).find(x => !x.is_tenant_admin) || (data||[])[0]
console.log(u.id)
const { data: g } = await db.from("user_groups").select("id,name").limit(1)
console.log(g?.[0]?.id ?? "")
