# CMS AI-first

## Stato

Questo incremento introduce il percorso guidato `/admin/cms/studio` e la persistenza tenant-aware del progetto CMS.

### Codice

- scelta template;
- personalizzazione testuale;
- descrizione pagine e menu;
- salvataggio e recupero della bozza per tenant;
- API server-side `/api/cms/ai-project`;
- migrazione `scripts/076_cms_ai_projects.sql` con RLS.

### UI/mock

- generazione AI della sitemap;
- creazione automatica delle pagine;
- comando vocale;
- anteprima generata;
- pubblicazione automatica.

## Regole

- Il client non invia né sceglie `property_id`.
- Il tenant deriva da `getAuthenticatedPropertyId`.
- Nessuna modifica automatica a `cms_pages`.
- Nessuna pubblicazione senza proposta, conferma, versioni e rollback.
- Le richieste future devono produrre configurazioni strutturate, non codice arbitrario per tenant.

## Prossimo incremento

Definire uno schema JSON versionato per sitemap, pagine, componenti, design token, SEO, media e warning; successivamente collegare l'orchestratore AI in sola modalità proposta.
