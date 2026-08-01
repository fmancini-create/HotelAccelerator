# CMS AI-first

## Obiettivo

Trasformare il CMS tradizionale in un percorso guidato utilizzabile tramite linguaggio naturale e, successivamente, voce.

## Stato attuale

### Wizard: Codice

`/admin/cms/studio` implementa tre step:

1. scelta template;
2. personalizzazione in linguaggio naturale;
3. descrizione di pagine, menu, contenuti e integrazioni.

Il progetto viene salvato tramite `/api/cms/ai-project` nella tabella tenant-scoped `cms_ai_projects` introdotta da `scripts/076_cms_ai_projects.sql`.

Sono persistiti:

- template scelto;
- nome struttura;
- prompt grafico;
- prompt pagine;
- step corrente;
- stato, versione e date tecniche.

### Generazione e pubblicazione: UI/mock

Restano volutamente disabilitati:

- generazione AI;
- input vocale;
- creazione automatica delle pagine;
- anteprima generata;
- pubblicazione.

## Sicurezza e isolamento

- L'API ricava il tenant esclusivamente da `getAuthenticatedPropertyId`.
- Il client non invia e non sceglie `property_id`.
- La tabella ha vincolo univoco per tenant e RLS per utenti autenticati.
- Il service role mantiene accesso esplicito per processi server autorizzati.
- Input e template sono validati e limitati in lunghezza.
- Il salvataggio non modifica `cms_pages` e non pubblica contenuti.

La migrazione deve essere applicata nell'ambiente prima di usare il salvataggio.

## Principi

- Non generare e accumulare codice arbitrario per tenant.
- Tradurre le richieste in configurazioni, componenti e token di design strutturati.
- Mantenere isolamento tenant e autorizzazione server-side.
- Conservare anteprima, versioni, pubblicazione controllata e rollback.
- Mantenere una base SEO stabile e server-rendered.
- Dichiarare sempre mock e funzioni non collegate.

## Prossimo incremento: proposta strutturata

Definire uno schema versionato per una proposta che includa:

- sitemap;
- pagine;
- slug;
- componenti ammessi;
- contenuti iniziali;
- fonti media autorizzate;
- design tokens;
- integrazioni richieste;
- metadati SEO;
- warning e dati mancanti.

L'orchestratore AI dovrà:

1. validare input e permessi;
2. produrre solo output conforme allo schema;
3. salvare la proposta come nuova versione;
4. non modificare `cms_pages` prima della conferma;
5. registrare modello, versione prompt, costo, esito ed errori.

## Incrementi successivi

### Media

Consentire la scelta di immagini già autorizzate del tenant. Non esporre file di altri tenant e non accettare riferimenti testuali non verificati come file reali.

### SEO e pubblicazione

Prima della pubblicazione validare almeno slug, duplicati, title, description, canonical, hreflang, heading, immagini, alt, dati strutturati, link interni e contenuti vuoti o duplicati.

### Voce

La voce deve essere un metodo di input per lo stesso orchestratore, non una logica separata. Trascrizione, consenso, conservazione e costi devono essere configurabili.

## Criteri per passare a Demo

- migrazione applicata in ambiente di prova;
- salvataggio e recupero verificati con almeno due tenant;
- test API e autorizzazioni;
- output AI validato tramite schema;
- anteprima reale;
- nessuna pubblicazione senza conferma esplicita;
- rollback verificato.
