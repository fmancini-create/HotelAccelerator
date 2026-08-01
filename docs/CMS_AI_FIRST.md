# CMS AI-first

## Obiettivo

Trasformare il CMS tradizionale in un percorso guidato utilizzabile tramite linguaggio naturale e, successivamente, voce.

## Stato di questo incremento

**UI/mock**: introdotto lo studio `/admin/cms/studio` con tre step, senza rimuovere l'editor tradizionale.

1. scelta template;
2. personalizzazione descritta in linguaggio naturale;
3. descrizione di pagine, menu, contenuti e integrazioni.

La generazione AI, la voce, il salvataggio del progetto e la pubblicazione sono volutamente disabilitati finché non vengono definiti contratti, permessi e persistenza.

## Principi

- Non generare e accumulare codice arbitrario per tenant.
- Tradurre le richieste in configurazioni, componenti e token di design strutturati.
- Mantenere isolamento tenant e autorizzazione server-side.
- Conservare anteprima, versioni, pubblicazione controllata e rollback.
- Mantenere una base SEO stabile e server-rendered.
- Dichiarare sempre mock e funzioni non collegate.

## Incrementi successivi

### 1. Persistenza progetto

Definire, dopo verifica dello schema esistente, la persistenza di:

- template scelto;
- design tokens e configurazione grafica;
- prompt originali;
- sitemap proposta;
- stato bozza/approvato/pubblicato;
- versioni e audit.

Non introdurre nuove tabelle prima di verificare se gli oggetti CMS esistenti possono essere estesi in modo retrocompatibile.

### 2. Orchestratore AI

Creare un endpoint tenant-aware che:

1. valida input e permessi;
2. converte la richiesta in output strutturato;
3. propone sitemap e componenti;
4. non pubblica automaticamente;
5. registra modello, versione prompt, costo, esito ed errori.

### 3. Media e cartelle

Consentire la scelta di immagini già autorizzate del tenant. Non esporre file di altri tenant e non affidarsi a riferimenti testuali non verificati.

### 4. SEO e pubblicazione

Prima della pubblicazione validare almeno:

- slug e duplicati;
- title, description e canonical;
- hreflang;
- heading hierarchy;
- immagini e alt text;
- dati strutturati;
- link interni;
- pagine vuote o contenuti duplicati.

### 5. Voce

La voce deve essere un metodo di input per lo stesso orchestratore, non una logica separata. Trascrizione, consenso, conservazione e costi devono essere configurabili.

## Criteri per passare a Codice/Demo

- persistenza tenant-aware verificata;
- API con autorizzazione server-side;
- output AI validato tramite schema;
- gestione errori e retry;
- anteprima reale;
- test dei permessi e dell'isolamento tenant;
- nessuna pubblicazione senza conferma esplicita.
