import { createClient } from "@supabase/supabase-js"

const sb = createClient(
  "https://aeynirkfixurikshxfov.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const ddl = `
CREATE TABLE IF NOT EXISTS public.sales_unmatched_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text,
  imap_uid bigint,
  inbox_label text,
  from_email text,
  from_name text,
  to_email text,
  recipients text[],
  subject text,
  body_text text,
  body_html text,
  in_reply_to text,
  email_references text,
  -- venditore suggerito (alias destinatario risolto su sales_agents.sender_email)
  suggested_agent_id uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','converted','archived')),
  resolved_lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_unmatched_emails_msgid_uidx
  ON public.sales_unmatched_emails (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_unmatched_emails_status_idx
  ON public.sales_unmatched_emails (status, received_at DESC);

ALTER TABLE public.sales_unmatched_emails ENABLE ROW LEVEL SECURITY;
`

async function run() {
  const { error } = await sb.rpc("exec_sql", { query: ddl })
  if (error) {
    console.error("DDL error:", error.message)
    process.exit(1)
  }
  // Forza il reload della cache schema di PostgREST (altrimenti la nuova
  // tabella non e' subito interrogabile via API REST).
  try {
    await sb.rpc("exec_sql", { query: "NOTIFY pgrst, 'reload schema';" })
  } catch {
    /* best-effort */
  }
  console.log("OK: tabella sales_unmatched_emails creata/verificata")
}

run()
