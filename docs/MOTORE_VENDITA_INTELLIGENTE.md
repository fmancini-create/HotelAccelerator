# Motore di Vendita Intelligente

Stato: `Codice`

## Obiettivo

Trasformare il CRM di HotelAccelerator da archivio di contatti a strumento operativo che suggerisce ogni giorno **chi contattare, perché e con quale prossima azione**, mantenendo il controllo umano sulle comunicazioni.

## Due applicazioni dello stesso motore

1. **4BID / suite software → strutture ricettive**: il motore può in futuro ricevere dati B2B da provider esterni tramite adapter (es. Apollo), arricchirli con i dati proprietari e guidare il commerciale nella vendita di HotelAccelerator, Santaddeo, HotelProfitAI e ManuBot.
2. **Struttura ricettiva → clienti e aziende**: lo stesso motore lavora sui contatti del CRM del tenant per riattivazione, vendita camere/servizi, corporate, eventi e relazione B2C/B2B.

Il vantaggio commerciale è dimostrativo: 4BID usa internamente lo stesso motore che propone alle strutture.

## Principi di prodotto

- interfaccia semplice: poche azioni prioritarie, non montagne di dati;
- ogni suggerimento deve spiegare il motivo;
- niente dati mockati;
- riuso del CRM esistente (`contacts`, aziende, pipeline, attività, chiamate, PMS);
- tenant isolation obbligatoria;
- azioni commerciali ad alto impatto con human-in-the-loop;
- consenso, disiscrizione e preferenze prevalgono sempre sul punteggio commerciale;
- provider esterni sostituibili tramite adapter, senza rendere Apollo il modello dati di HotelAccelerator.

## V1 implementata

La prima slice non introduce nuove tabelle e non invia nulla automaticamente.

### Input reali

Il motore legge, nel tenant attivo:

- lead score già presente nel CRM;
- valore economico storico;
- numero di prenotazioni;
- livello VIP;
- ultima prenotazione;
- aperture e click email;
- disponibilità di telefono/email;
- consenso marketing e stato di disiscrizione.

### Output

Per ogni profilo restituisce:

- punteggio 0–100;
- priorità alta/media/bassa;
- prossima azione consigliata;
- canale consigliato;
- motivazione leggibile;
- segnali principali che hanno determinato la scelta.

Azioni V1: telefonata umana, email personale da preparare, riattivazione della relazione, revisione del profilo.

### UI

Nuova sezione CRM: `/admin/crm/intelligence`, denominata **Vendita intelligente** nella navigazione.

La schermata mostra numeri essenziali e la lista ordinata di ciò che conviene fare adesso. Ogni riga porta alla scheda reale del contatto.

### API

`GET /api/admin/crm/sales-intelligence`

- autorizzazione area CRM server-side;
- property risolta dal contesto autenticato, mai accettata dal client;
- massimo 1.000 contatti analizzati per richiesta in V1;
- massimo 50 suggerimenti restituiti;
- nessun invio automatico.

## Sicurezza e privacy V1

Un contatto disiscritto non riceve una raccomandazione di marketing eseguibile. Se è disponibile l'email ma manca un consenso utilizzabile, il motore chiede una verifica invece di suggerire l'invio.

Questa protezione non sostituisce la definizione completa della base giuridica GDPR per i futuri flussi B2B e per i provider di enrichment.

## Evoluzione prevista

1. Collegare segnali reali da pipeline, attività, telefonate, Inbox e PMS.
2. Registrare esito delle azioni per misurare conversione e apprendimento.
3. Generare briefing pre-chiamata e bozze personalizzate con approvazione umana.
4. Introdurre un adapter B2B per provider di prospecting/enrichment (Apollo è candidato, non dipendenza obbligatoria).
5. Costruire playbook distinti per vendita software 4BID e vendita hospitality del tenant.
6. Aggiungere scoring configurabile per obiettivo commerciale e segmento.
7. Solo dopo evidenza sufficiente, valutare automazioni progressive con guardrail e audit.

## Evidenze codice

- `lib/crm/sales-intelligence.ts`
- `lib/crm/__tests__/sales-intelligence.test.ts`
- `app/api/admin/crm/sales-intelligence/route.ts`
- `app/admin/crm/intelligence/page.tsx`
- `components/crm/crm-workspace-nav.tsx`

## Limiti dichiarati

- il punteggio V1 è euristico e spiegabile, non un modello predittivo addestrato;
- non usa ancora pipeline, chiamate o conversazioni come segnali;
- non integra ancora Apollo;
- non invia email, WhatsApp, social o chiamate;
- non è ancora collaudato su tenant reale.

Passaggio di maturità successivo: `Tenant reale` solo dopo deploy, prova con dati reali di una struttura, verifica isolamento e controllo delle raccomandazioni prodotte.
