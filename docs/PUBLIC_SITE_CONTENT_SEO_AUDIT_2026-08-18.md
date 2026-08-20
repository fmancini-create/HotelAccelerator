# Audit contenuti e SEO del sito pubblico

Data: 2026-08-18

Ambito: `https://www.hotelaccelerator.com` e pagine pubbliche presenti nella sitemap

Metodo: confronto tra sito live, repository, documentazione tecnica e stati ufficiali di `MODULE_REGISTRY.md`

## Esito sintetico

Il sito pubblico descriveva HotelAccelerator come una suite completa e già automatizzata, usando prezzi, recensioni,
volumi cliente e incrementi percentuali senza evidenza nel repository. Le pagine sono state riscritte per collegare ogni
affermazione a una capacità osservabile e per distinguere chiaramente fra codice presente, tenant reale e verifiche
necessarie.

Questa attività non promuove lo stato di alcun modulo. In particolare, una UI o una route esistente non equivalgono a
`Production-ready` o `Vendibile`.

## Problemi rilevati sul sito live

| Area | Problema | Rischio |
|---|---|---|
| Homepage | «150+ hotel», risultati `+35%`, `-50%`, `2x`, testimonianze nominative e prezzi non documentati | Credibilità, conformità commerciale e dati strutturati fuorvianti |
| Dati strutturati | `Offer` da 99 EUR con validità scaduta e `AggregateRating 4.9/127` senza evidenza | Rich result non attendibili e possibile azione manuale |
| CMS | Incrementi SEO fino al 300% e presentazione del flusso come già pronto per ogni struttura | Confusione tra codice di pubblicazione e collaudo tenant/domain |
| CRM | Lead scoring automatico, segmentazione avanzata e retention `+45%` | Funzioni e risultati non verificati end-to-end |
| Campagne email | Invio, automazioni, A/B test e risultati presentati come operativi | Nel codice verificato la creazione della campagna non prova il worker di invio |
| Inbox | Tutti i canali presentati come attivi e riduzione del tempo di risposta garantita | Solo Gmail ha evidenza `Tenant reale`; gli altri connettori vanno verificati |
| Analytics | Real-time al secondo, attribution, forecast, report automatici e dati demo mostrati come reali | Il codice raccoglie sessioni/eventi ma non prova la copertura promessa |
| AI | Concierge autonomo 24/7, risposta sotto 3 secondi e cinque lingue garantite | La capacità verificata è la bozza on demand con revisione umana |
| Richiesta demo | Form privo di action o handler: il pulsante non inviava i dati | Perdita di richieste e consenso dichiarato senza trattamento effettivo |
| SEO tecnica | Canonical non-www mentre il sito risolve su www; titoli duplicati; privacy e termini ereditavano la canonical della home | Consolidamento segnali e indicizzazione non corretti |
| Pagine legali | Termini descrivevano trial, piani, rinnovo automatico e portale di fatturazione non verificati | Disallineamento fra prodotto, sito e accordi commerciali |

## Mappa fra contenuto pubblico e stato verificato

| Pagina | Posizionamento adottato | Evidenza usata | Limite dichiarato |
|---|---|---|---|
| Homepage | Software gestionale modulare per hotel | Moduli e route presenti nel repository | Attivazione dipendente da tenant, ruolo e integrazioni |
| CMS | Contenuti, media, SEO, pubblicazione versionata e rollback | `docs/CMS_AI_FIRST.md` e codice CMS | Collaudo dominio e pubblicazione per il tenant |
| CRM | Contatti, consensi, soggiorni, ricerca e KPI disponibili | API e pagine CRM tenant-scoped | Segmenti dinamici, scoring e PMS da verificare |
| Campagne email | Creazione campagne, bozze e lettura metriche presenti | API marketing e interfaccia campagne | Invio, scheduling, automazioni e A/B test non dichiarati pronti |
| Inbox | Gmail, thread, label, risposta e collaborazione | Gmail registrato `Tenant reale` in `MODULE_REGISTRY.md` | Recovery, webhook e altri canali ancora da verificare |
| Analytics | Siti, write key, sessioni, UTM ed eventi ricevuti | Modello di tracking e relativi endpoint | Nessuna promessa di real-time, attribution o forecast |
| AI | Bozze da knowledge base con fonti e confidenza | API di draft e gestione knowledge base | Invio umano; automazione futura solo dopo collaudo |
| Demo | Contatto email aziendale con richiesta precompilata | `mailto:info@4bid.it` già pubblicato | Nessun form fittizio o promessa di trial |

## Interventi SEO eseguiti

1. Canonical uniformi su `https://www.hotelaccelerator.com` per tutte le pagine della piattaforma.
2. Titolo e descrizione unici per homepage, sei pagine funzione, richiesta demo, privacy e termini.
3. Gerarchia semantica coerente: un solo `h1`, sezioni `h2`, breadcrumb e link interni fra moduli collegati.
4. FAQ visibili e dati strutturati `FAQPage` coerenti con il testo realmente mostrato.
5. Dati strutturati `WebSite`, `SoftwareApplication`, `WebPage`, `BreadcrumbList` e `ContactPage` senza prezzi o rating
   non verificati.
6. Sitemap allineata al dominio www e data di modifica stabile; niente data corrente artificiale per ogni richiesta.
7. `robots.txt` consente homepage, pagine funzione, demo e pagine legali senza bloccare gli asset Next.js necessari al
   rendering.
8. Eliminato il codice di verifica Google segnaposto.
9. Copy orientato a intenti specifici e realistici: software gestionale hotel, CRM alberghiero, CMS hotel, inbox Gmail,
   tracking sito hotel e AI assistita.

## Titoli SEO adottati

| URL | Titolo |
|---|---|
| `/` | Software gestionale modulare per hotel \| HotelAccelerator |
| `/features/cms` | CMS per hotel con sito web e SEO \| HotelAccelerator |
| `/features/crm` | CRM alberghiero per ospiti e soggiorni \| HotelAccelerator |
| `/features/email-marketing` | Campagne email per hotel e CRM \| HotelAccelerator |
| `/features/inbox-omnicanale` | Inbox omnicanale per hotel e Gmail \| HotelAccelerator |
| `/features/analytics` | Analytics e tracking per hotel \| HotelAccelerator |
| `/features/ai-assistant` | AI per hotel con controllo umano \| HotelAccelerator |
| `/request-access` | Richiedi una demo di HotelAccelerator |

## Attività ancora necessarie

- Eseguire una revisione legale professionale di Privacy Policy e Termini prima di considerarli definitivi.
- Collegare un sistema reale di acquisizione lead se si desidera un form web; fino ad allora il contatto resta via email.
- Verificare dopo il deploy canonical, title, JSON-LD, sitemap, robots, status HTTP e rendering su ogni URL.
- Configurare una proprietà Google Search Console reale e inviare la sitemap; non usare codici di verifica segnaposto.
- Misurare traffico e conversioni solo dopo aver definito consenso, evento e fonte, evitando percentuali commerciali non
  sostenute da dati.
- Aggiungere case study o recensioni solo con cliente identificabile, consenso e metrica riproducibile.

## File principali modificati

- `components/platform/platform-landing.tsx`
- `components/platform/feature-landing-page.tsx`
- `app/(platform)/features/*/page.tsx`
- `app/(platform)/request-access/page.tsx`
- `app/(frontend)/layout.tsx`
- `app/layout.tsx`
- `app/sitemap.ts`
- `app/robots.ts`
- `app/privacy/page.tsx`
- `app/terms/page.tsx`
