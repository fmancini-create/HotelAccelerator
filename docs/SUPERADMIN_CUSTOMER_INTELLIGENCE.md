# Customer Intelligence 4BID — Super Admin

## Scopo

`/super-admin/crm` è il CRM B2B della piattaforma 4BID. Non sostituisce il CRM tenant di HotelAccelerator: il CRM tenant gestisce ospiti e contatti della singola struttura, mentre questo workspace ragiona per **account cliente della suite**.

Il CRM Super Admin è diviso in tre aree operative:

- **Commerciale** (`/super-admin/crm`): prospect, clienti, segmenti e cross-sell;
- **Assistenza** (`/super-admin/crm/support`): ticket, priorità, SLA, assegnazione e stato;
- **Customer Success** (`/super-admin/crm/success`): customer health, onboarding, adozione, churn, rinnovi e azioni post-vendita.

Le aree condividono sempre la stessa identità cliente e non duplicano anagrafiche.

## Identità cliente

La chiave è `customer_accounts.id`. I prodotti posseduti derivano da `suite_product_entitlements`; i riferimenti ai tenant satellite derivano da `suite_tenant_links`.

Il profilo commerciale è salvato in `platform_customer_profiles`. Lo stato sintetico di ciascun prodotto è salvato in `platform_customer_product_snapshots`.

I ticket di assistenza sono salvati in `platform_support_cases` e puntano allo stesso `customer_accounts.id`. Possono riferirsi a un singolo prodotto oppure all'intera suite. `source_conversation_id` e `source_external_ref` permettono di collegare Inbox e support federation senza rendere il CRM dipendente dal database del satellite.

Le attività Customer Success sono salvate in `platform_customer_success_actions` e restano collegate allo stesso account cliente.

## Regole di sicurezza

Le tabelle `platform_customer_*` e `platform_support_cases` sono backend-only: RLS attivo, nessun accesso `anon` o `authenticated`, CRUD solo `service_role`. Le API `/api/super-admin/crm*` richiedono un collaboratore attivo con ruolo `super_admin` prima di usare il service client.

I prospect sono letti esclusivamente dal tenant Core con `properties.slug = '4bid'` e `type = 'company'`; non viene eseguita una lettura globale dei prospect degli altri tenant.

## Assistenza e SLA

Il ticket supporta prodotto, tipologia, priorità, canale, responsabile, gruppo, scadenze SLA, timestamp di prima risposta/risoluzione e collegamento opzionale a GitHub.

La prima versione usa SLA in ore solari dalla creazione del ticket:

- critica: prima risposta 1h, risoluzione 8h;
- alta: prima risposta 4h, risoluzione 24h;
- normale: prima risposta 8h, risoluzione 72h;
- bassa: prima risposta 24h, risoluzione 120h.

Il modello è predisposto per sostituire questi valori con policy configurabili senza cambiare l'identità del ticket.

## Customer Success

La pagina Customer Success riusa i dati di Customer Intelligence e ordina il lavoro usando segnali già presenti: health, churn risk, onboarding, usage score, inattività e rinnovi. Il punteggio è solo una priorità operativa: non esegue contatti o automazioni in autonomia.

Ogni segnale può diventare un'azione esplicita con tipo, priorità, responsabile, scadenza e stato.

## Segmenti di sistema

I segmenti iniziali sono calcolati a runtime dai dati reali:

- Acquisizione: prospect caldi, follow-up scaduti, prospect ingaggiati.
- Clienti: clienti suite, nuovi clienti 30 giorni, multi-prodotto, suite completa.
- Cross-sell: alta probabilità HotelAccelerator, Santaddeo, HotelProfitAI, ManuBot.
- Customer Health: clienti a rischio.
- Rinnovi: scadenze entro 30 giorni.

Il punteggio cross-sell è un ordinamento commerciale esplicabile: usa tipologia azienda, dimensione, prodotti già attivi e customer health. Non attiva campagne o acquisti in automatico.

## Dati satellite

Il Core non deve fare query cross-database dal browser. I futuri Customer Summary dei prodotti devono arrivare server-to-server e aggiornare `platform_customer_product_snapshots` con metriche normalizzate (usage score, health, onboarding, ultimo utilizzo, rinnovo, MRR e metriche specifiche).

La support federation resta compatibile: quando una conversazione satellite viene proiettata nella Inbox 4BID, il relativo ticket può essere associato tramite riferimenti esterni senza spostare la source of truth del thread.
