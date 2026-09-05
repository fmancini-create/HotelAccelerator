# Customer Intelligence 4BID — Super Admin

## Scopo

`/super-admin/crm` è il CRM B2B della piattaforma 4BID. Non sostituisce il CRM tenant di HotelAccelerator: il CRM tenant gestisce ospiti e contatti della singola struttura, mentre questo workspace ragiona per **account cliente della suite**.

## Identità cliente

La chiave è `customer_accounts.id`. I prodotti posseduti derivano da `suite_product_entitlements`; i riferimenti ai tenant satellite derivano da `suite_tenant_links`.

Il profilo commerciale è salvato in `platform_customer_profiles`. Lo stato sintetico di ciascun prodotto è salvato in `platform_customer_product_snapshots`.

## Regole di sicurezza

Le tabelle `platform_customer_*` sono backend-only: RLS attivo, nessun accesso `anon` o `authenticated`, CRUD solo `service_role`. L'API `/api/super-admin/crm` richiede un collaboratore attivo con ruolo `super_admin` prima di usare il service client.

I prospect sono letti esclusivamente dal tenant Core con `properties.slug = '4bid'` e `type = 'company'`; non viene eseguita una lettura globale dei prospect degli altri tenant.

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
