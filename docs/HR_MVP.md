# HotelAccelerator HR — MVP

Stato: **Codice**, non ancora collaudato su tenant reale.

## Incluso

- modulo `hr` attivabile per tenant;
- reparti e dipendenti tenant-scoped;
- calendario settimanale, turni diurni/notturni e controllo sovrapposizioni;
- bozza, pubblicazione e coda notifiche idempotente;
- consegna in-app, email SMTP e Telegram con retry;
- area personale con conferma/rifiuto turno;
- richieste e approvazioni di ferie, permessi, ROL, malattia e indisponibilita';
- RLS, controllo entitlement e associazione account per email interna al tenant.

## Configurazione notifiche

- Telegram usa il bot attivo gia' configurato dal tenant e `telegram_chat_id` del dipendente.
- Email usa `HR_SMTP_HOST`, `HR_SMTP_PORT`, `HR_SMTP_SECURE`, `HR_SMTP_USER`, `HR_SMTP_PASSWORD`, `HR_SMTP_FROM`.
- Il cron `/api/cron/hr-notifications` richiede `CRON_SECRET` e ritenta fino a cinque volte.

## Non ancora incluso

- documenti privati, cedolini e lettura AI;
- timbrature, straordinari, banca ore e regole CCNL;
- scambio turno tra colleghi;
- metriche delle attivita' operative.
