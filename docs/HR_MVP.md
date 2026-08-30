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
- RLS, controllo entitlement e associazione account per email interna al tenant;
- provisioning automatico del dipendente predefinito: quando HR e' attivo, il primo tenant admin viene collegato a una scheda `hr_employees` senza dover essere ricreato manualmente.

## Utente predefinito e scheda dipendente

L'account amministratore principale della struttura deve poter usare subito `Il mio lavoro` quando il modulo HR e' attivo. La migrazione `20260830234500_auto_link_default_hr_employee.sql` applica tre garanzie idempotenti:

1. backfill dei tenant HR gia' attivi;
2. provisioning quando HR viene attivato su un tenant esistente;
3. provisioning quando viene creato o promosso il primo tenant admin mentre HR e' gia' attivo.

La selezione resta tenant-scoped e usa il tenant admin piu' anziano (`created_at`, poi `id`). I superadmin di piattaforma che selezionano temporaneamente una struttura non vengono trasformati in dipendenti. Il vincolo `UNIQUE (property_id, admin_user_id)` impedisce duplicati.

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
- Le funzioni di provisioning automatico sono `SECURITY DEFINER`, fissano il `search_path` e non concedono `EXECUTE` a `public`, `anon` o `authenticated`; vengono invocate solo dai trigger interni.
- Applicare `20260830150000_complete_hr_workforce.sql` e `20260830234500_auto_link_default_hr_employee.sql` prima del deploy. Rollback del provisioning: rimuovere i due trigger e le tre funzioni senza cancellare le schede dipendente gia' create; i dati HR esistenti restano conservati.
