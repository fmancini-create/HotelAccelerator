# CMS AI-first

## Stato

Il CMS principale è disponibile in `/admin/cms/studio`; `/admin/cms` resta accessibile come
**CMS precedente** durante la transizione. Il nuovo flusso usa persistenza tenant-aware,
documenti JSON versionati e pubblicazioni immutabili.

### Codice

- scelta template;
- personalizzazione testuale;
- descrizione pagine e menu;
- salvataggio e recupero della bozza per tenant;
- riapertura automatica dell'editor quando il tenant possiede già un documento builder salvato;
- accesso esplicito alla configurazione iniziale tramite `/admin/cms/studio?setup=1`, senza cancellare la bozza;
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
- scelta self-service del sottodominio con controllo disponibilità e nomi riservati;
- configurazione del dominio personalizzato con record DNS letti in tempo reale dall'API Vercel;
- stati distinti per sottodominio, dominio personalizzato e indirizzo attivo;
- verifica della proprietà, routing e attivazione SSL demandate a Vercel;
- link pubblico mostrato solo quando esistono una pubblicazione attiva, frontend abilitato,
  dominio verificato, DNS valido e risposta HTTPS corretta nel browser.

La configurazione tenant si gestisce da `/admin/settings/domains`. Il salvataggio riserva prima
il nome univoco nel database e poi registra il dominio su Vercel; in caso di errore, database e
domini appena creati vengono ripristinati. Il client non può scegliere il `property_id`.

Variabili server necessarie per i domini: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`
(o `VERCEL_PROJECT_NAME`) e, per progetti team, `VERCEL_TEAM_ID`.

### Stati dominio

- `not_configured`: il tenant non ha inserito un indirizzo;
- `automation_unavailable`: mancano le variabili server Vercel;
- `not_registered`: il nome è salvato ma non assegnato al progetto Vercel;
- `verification_required`: Vercel richiede il record di proprietà mostrato nell'interfaccia;
- `dns_pending`: proprietà verificata, ma routing DNS non ancora valido;
- `ready`: dominio verificato e configurazione Vercel valida;
- `error`: controllo Vercel temporaneamente non disponibile o permessi insufficienti.

Lo stato operativo viene derivato dall'API Vercel a ogni lettura: i campi legacy presenti in
`properties` non sono usati per mostrare un link pubblico pronto.

### Collaudo tenant reale

1. Pubblicare una versione dal nuovo CMS.
2. Salvare un sottodominio disponibile in **Impostazioni → Domini**.
3. Attendere lo stato `ready` e la risposta HTTPS positiva.
4. Verificare navigazione, pagine, metadati e responsive sul sito pubblico.
5. Pubblicare una modifica innocua e ripristinare la versione precedente.
6. Se si usa un dominio personalizzato, inserire esattamente i record indicati dall'API Vercel
   e ripetere il controllo HTTPS.

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

Completare il collaudo end-to-end su almeno un tenant reale e raccogliere telemetria su errori
di provisioning, tempi DNS/SSL, pubblicazioni e rollback prima di dichiarare la funzione
vendibile su larga scala.
