alter table public.phone_calls
  add column if not exists transcription text,
  add column if not exists transcription_summary text,
  add column if not exists recording_url text,
  add column if not exists sentiment text,
  add column if not exists transcription_updated_at timestamptz;

comment on column public.phone_calls.transcription is 'Trascrizione della chiamata fornita da 3CX/AI.';
comment on column public.phone_calls.transcription_summary is 'Riepilogo automatico della chiamata fornito da 3CX/AI.';
comment on column public.phone_calls.recording_url is 'URL della registrazione 3CX, quando disponibile.';
comment on column public.phone_calls.sentiment is 'Sentiment della chiamata fornito dal provider.';
comment on column public.phone_calls.transcription_updated_at is 'Ultimo aggiornamento dei dati di trascrizione.';
