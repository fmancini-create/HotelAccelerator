# CMS AI-first

## Stato

Il CMS dispone del percorso guidato `/admin/cms/studio`, persistenza tenant-aware e contratto JSON versionato per il futuro editor visuale.

### Codice

- scelta template;
- personalizzazione testuale;
- descrizione pagine e menu;
- salvataggio e recupero della bozza per tenant;
- API server-side `/api/cms/ai-project`;
- migrazione `scripts/076_cms_ai_projects.sql` con RLS;
- contratto `lib/cms/builder-document.ts` versione 1;
- persistenza `builder_document` tramite `scripts/077_cms_builder_document_v1.sql`;
- validazione server-side del documento;
- comandi strutturati per spostamento elementi, riordino sezioni, modifica e visibilità responsive;
- test del contratto e dei link non consentiti.

### UI/mock

- template grafici completi;
- editor drag-and-drop;
- esecuzione dei comandi strutturati;
- generazione AI della sitemap;
- creazione automatica delle pagine;
- comando vocale;
- anteprima generata;
- generazione AI della pubblicazione.

### Pubblicazione (Codice)

- pubblicazione esplicita della bozza validata;
- versioni immutabili per tenant e versione attiva atomica;
- renderer pubblico unico per sottodominio e dominio personalizzato;
- rollback tracciato come nuova versione;
- metadati SEO per pagina pubblicata;
- migrazione `scripts/080_cms_publication_versions.sql`;
- registrazione automatica di sottodomini e domini personalizzati tramite Vercel Project Domains API;
- verifica del dominio personalizzato e attivazione SSL demandate a Vercel.

Per portare la funzione a **Demo** occorre applicare la migrazione in un ambiente di test,
pubblicare un documento e verificare tutte le pagine sul dominio del tenant.

Variabili server necessarie per i domini: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`
(o `VERCEL_PROJECT_NAME`) e, per progetti team, `VERCEL_TEAM_ID`.

## Builder document v1

Il documento contiene:

- design token condivisi;
- navigazione;
- pagine e metadati SEO;
- sezioni componibili;
- elementi come titoli, testi, immagini, pulsanti, booking widget e spaziatori;
- posizione distinta per desktop, tablet e mobile;
- warning di validazione.

Mouse, testo e voce dovranno produrre gli stessi comandi validati. Non devono modificare direttamente HTML o codice arbitrario.

## Regole

- Il client non invia né sceglie `property_id`.
- Il tenant deriva da `getAuthenticatedPropertyId`.
- Ogni documento ricevuto dall'API viene validato con Zod.
- Link eseguibili come `javascript:` non sono consentiti.
- Nessuna modifica automatica a `cms_pages`: il nuovo builder usa release immutabili dedicate.
- Nessuna pubblicazione senza conferma, versioni e rollback.
- Il JSON salvato è configurazione, non codice eseguibile.

## Prossimo incremento

Implementare l'esecutore puro dei comandi con undo/redo e storico, poi collegare un primo editor visuale vincolato. Solo dopo introdurre interpretazione testuale e vocale degli stessi comandi.
