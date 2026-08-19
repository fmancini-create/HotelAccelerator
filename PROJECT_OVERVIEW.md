# HotelAccelerator — Project Overview

Ultimo aggiornamento: 2026-08-19

## Missione

HotelAccelerator è la piattaforma madre multi-tenant per strutture ricettive. Unifica relazione con l'ospite, vendita diretta, revenue management, controllo economico-finanziario, manutenzioni, dati e automazioni.

Questo documento descrive la visione del prodotto. Lo stato verificato delle singole funzioni vive in `MODULE_REGISTRY.md`.

## Ecosistema ufficiale

| Prodotto | Ruolo | Modalità |
|---|---|---|
| HotelAccelerator Core | Identità, tenant, ruoli, dashboard, inbox, CRM, CMS, tracking, booking, automazioni | Piattaforma madre |
| Santaddeo | RMS, pricing, connettori PMS, forecast e intelligence della domanda | Modulo integrabile e prodotto autonomo |
| HotelProfitAI | Controllo di gestione, contabilità, fatture, banche e finanza | Modulo integrabile e prodotto autonomo |
| ManuBot | Segnalazioni, manutenzioni e attività operative | Modulo integrabile e prodotto autonomo |
| 4BID | Brand, sito corporate, commerciale e area documentale | Progetto collegato, non modulo operativo salvo decisione |

AutoExel, MyPetSenseAI, Ecomobility e altri esperimenti restano separati finché una decisione architetturale esplicita non ne approva l'integrazione.

## Principi di prodotto

- Un solo accesso, con funzioni abilitate per tenant, ruolo e abbonamento.
- Moduli autonomi ma interoperabili tramite API ed eventi versionati.
- Dati rigorosamente isolati tra tenant.
- Un solo proprietario per cron, webhook e automazioni.
- Provider esterni sostituibili tramite adapter.
- Ogni funzione comprende UI, dati, backend, autorizzazioni, errori, audit, test e monitoraggio.
- Nessuna funzione è dichiarata completa senza evidenze.
- Il prodotto deve restare comprensibile e governabile anche da un founder non tecnico che lavora con assistenti AI e v0.

## Utenti principali

- proprietà e direzione;
- revenue manager;
- booking e front office;
- amministrazione e controllo di gestione;
- manutentori e responsabili operativi;
- consulenti e super-amministratori 4BID.

## Obiettivi

1. Creare una visione unica dell'hotel e delle attività da svolgere.
2. Aumentare ricavi, conversione e vendita diretta.
3. Ridurre lavoro manuale, errori e dispersione tra strumenti.
4. Rendere costi, marginalità, liquidità e manutenzioni misurabili.
5. Trasformare dati e conversazioni in decisioni e automazioni controllabili.
6. Offrire prodotti utilizzabili singolarmente e una suite coerente.
7. Scalare a migliaia di strutture senza trasformare l'operatività in un progetto IT per l'albergatore.

## Documenti governanti

- `AGENTS.md`: regole operative per agenti AI e sviluppo assistito.
- `MODULE_REGISTRY.md`: inventario e maturità delle funzioni.
- `ARCHITECTURE.md`: confini tecnici e principi invarianti.
- `DECISIONS.md`: decisioni architetturali e di prodotto.
- `INTEGRATIONS.md`: provider, responsabilità e stato dei connettori.
- `ROADMAP.md`: priorità e sequenza di realizzazione.

## Regola di aggiornamento

Ogni modifica sostanziale deve aggiornare i documenti interessati nella stessa pull request. Le chat possono proporre requisiti, ma il repository è la fonte tecnica primaria.
