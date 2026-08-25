-- Credenziale distinta e cifrata per gli strumenti vocali 3CX.
--
-- Non viene creata una tabella né una Data API surface: telephony_integrations
-- resta backend-only e le sue RLS/grant correnti rimangono invariati. Il valore
-- è sempre scritto cifrato dall'applicazione (enc:v1:) e non sostituisce la
-- credenziale del template CRM.
alter table public.telephony_integrations
  add column if not exists voice_inbound_secret_encrypted text;

comment on column public.telephony_integrations.voice_inbound_secret_encrypted is
  'Encrypted inbound credential scoped only to 3CX voice-agent HTTP tools.';
