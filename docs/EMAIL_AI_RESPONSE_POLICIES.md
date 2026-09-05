# Email AI response policies

## Obiettivo

Impedire che l'Autopilota email risponda a robot, autoresponder, bounce, newsletter e notifiche automatiche, mantenendo una configurazione tenant semplice e comprensibile.

## Ordine di decisione

Prima di chiamare il modello, il Core applica un classificatore deterministico tenant-scoped:

1. guardrail di sicurezza non disattivabili;
2. blocchi espliciti del tenant;
3. mittenti esplicitamente attendibili;
4. domini interni;
5. mailing list / bulk;
6. mittenti macchina;
7. mittenti transazionali;
8. messaggi ordinari.

La decisione risultante e una di:

- `skip`: nessuna generazione e nessun invio;
- `draft`: l'IA puo preparare una bozza ma non inviarla automaticamente;
- `autopilot`: non alza l'autonomia della base; il messaggio segue la modalita della knowledge base primaria.

## Guardrail non disattivabili

Sono sempre `skip`, anche se il mittente e nella allow-list del tenant:

- `Auto-Submitted` diverso da `no`;
- `X-Auto-Response-Suppress` presente;
- `Return-Path: <>`;
- `mailer-daemon` / `postmaster`;
- oggetti riconoscibili come autoresponder, out-of-office o delivery failure.

Questo evita loop di risposta automatica e comportamenti reputazionalmente pericolosi.

## Default tenant

- email automatiche: `skip`;
- newsletter/bulk: `skip`;
- transazionali/gestionali: `draft`;
- domini interni: `skip`;
- messaggi ordinari: `autopilot` (sempre subordinato alla modalita della base primaria).

## Configurazione

La UI vive in `/admin/knowledge`, scheda **Regole di risposta email**. Le opzioni comuni sono visibili subito; allow-list, block-list, domini interni e parole chiave oggetto sono raccolti sotto **Impostazioni avanzate**.

La tabella `email_ai_response_policies` e backend-only, una riga per `property_id`, con RLS attiva e privilegi Data API revocati ad `anon` e `authenticated`. L'API deriva sempre il tenant dalla sessione server-side.

## Provider

La policy engine non dipende da Gmail. Gmail espone inoltre gli header utili tramite `parseGmailMessage`; Outlook/IMAP dovranno normalizzare gli stessi segnali nel contratto del task email senza duplicare la logica decisionale.

## Osservabilita

Ogni `skip` deterministico produce un log strutturato con tenant, canale, conversazione, categoria e motivo. Non viene registrato il corpo della mail nel log della policy.

## Rollback

La migrazione e additiva. Disabilitare l'uso della policy nel processore email ripristina il comportamento precedente; la tabella puo restare senza impatto sugli altri flussi. Non rimuovere i guardrail di bounce/autoresponder senza una decisione esplicita di sicurezza.
