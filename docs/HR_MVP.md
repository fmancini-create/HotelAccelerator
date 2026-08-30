# HotelAccelerator HR — Workforce v2

Stato: **Codice**, non ancora collaudato su tenant reale.

## Incluso

- modulo `hr` attivabile per tenant;
- reparti e dipendenti tenant-scoped;
- calendario settimanale, turni diurni/notturni e controllo sovrapposizioni;
- bozza, pubblicazione e coda notifiche idempotente;
- consegna in-app, email SMTP e Telegram con retry;
- area personale con conferma/rifiuto turno;
- richieste e approvazioni di ferie, permessi, ROL, malattia e indisponibilita';
- timbratura web entrata/uscita con geolocalizzazione puntuale, geofence configurabile e gestione anomalie;
- registro presenze e revisione amministrativa;
- archivio privato per cedolini, contratti, certificati e documenti, con URL di download temporanei;
- scadenze documentali e audit delle operazioni sensibili;
- RLS, controllo entitlement e associazione account per email interna al tenant.

## Configurazione notifiche

- Telegram usa il bot attivo gia' configurato dal tenant e `telegram_chat_id` del dipendente.
- Email usa `HR_SMTP_HOST`, `HR_SMTP_PORT`, `HR_SMTP_SECURE`, `HR_SMTP_USER`, `HR_SMTP_PASSWORD`, `HR_SMTP_FROM`.
- Il cron `/api/cron/hr-notifications` richiede `CRON_SECRET` e ritenta fino a cinque volte.

## Limiti residui

- calcolo del cedolino e invio ai consulenti (restano responsabilita' del software paghe);
- lettura AI dei documenti: da introdurre solo con conferma umana e campi verificabili;
- regole economiche CCNL, maggiorazioni, straordinari e banca ore configurabili;
- scambio turno tra colleghi;
- metriche delle attivita' operative.

## Privacy e sicurezza

- La posizione viene acquisita solo quando il dipendente preme entrata/uscita; non esiste tracking continuo.
- I documenti usano il bucket privato `hr-private`; il browser riceve soltanto URL firmati di 60 secondi dopo controllo tenant/dipendente.
- Applicare `20260830150000_complete_hr_workforce.sql` prima del deploy. Rollback: disabilitare le nuove UI/API e conservare le tabelle; non eliminare documenti o timbrature senza procedura di retention approvata.
