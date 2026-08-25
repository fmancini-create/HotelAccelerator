# Sincronizzazione interna delle knowledge base 4BID

## Scopo e stato

Stato: `Codice` nel repository; non applicato al database di produzione e non
ancora configurato nei segreti GitHub/Vercel.

Le basi commerciali 4BID non devono dipendere da pagine pubbliche. Il
repository genera un payload testuale dai soli file elencati in
`docs/knowledge/4bid/manifest.json` e lo invia a
`POST /api/external/knowledge-sync`. Il backend salva il testo in
`knowledge_sources` con `type = text`, senza `url` né `file_url`, e lo
indicizza con il motore già esistente.

L'elenco dei file, la revisione Git e l'impronta SHA-256 sono metadati di
audit nella tabella backend-only `internal_knowledge_sync_sources`; non sono
link pubblici e non vengono passati al retrieval dell'agente.

## Flusso

1. Un merge su `main` avvia `.github/workflows/sync-4bid-internal-knowledge.yml`.
2. `scripts/sync-4bid-internal-knowledge.mjs` legge soltanto i file Markdown
   nella allowlist e compila una fonte per prodotto.
3. GitHub Actions firma il corpo raw con HMAC SHA-256 e invia revisione,
   impronta, percorsi e contenuto all'endpoint.
4. L'endpoint verifica firma a tempo costante, timestamp entro cinque minuti,
   dimensione e schema del payload; risolve da solo il tenant `4bid`.
5. La funzione SQL serializza il prodotto, crea o aggiorna la sola base/fonte
   dell'hub e mette la fonte in stato `pending` quando il contenuto cambia.
6. L'indicizzatore esistente e il cron di recovery aggiornano chunk, stato e
   diagnostica. Il sync non gestisce un secondo indice o un secondo retry.

Il workflow ritenta per un massimo di sei minuti: evita un falso fallimento se
Vercel sta ancora promuovendo il deployment nato dallo stesso merge. Un errore
persistente di migrazione o configurazione resta invece visibile come fallimento
del workflow.

Una modifica a file non incluso non entra automaticamente nella base: è una
scelta di sicurezza, non una perdita di funzionalità. Ogni modifica sostanziale
deve aggiornare la documentazione di prodotto approvata nello stesso PR.

## Configurazione necessaria prima del merge

1. Applicare, in ordine, le migrazioni `20260824170540_add_4bid_voice_ivr_routes.sql`
   e `20260825093220_add_internal_4bid_knowledge_sync.sql` in un ambiente
   controllato.
2. In Vercel, impostare in Production:
   - `INTERNAL_KNOWLEDGE_SYNC_SECRET` con un valore casuale di almeno 32
     caratteri. Non usare `CRON_SECRET`, chiavi Supabase, token 3CX o segreti
     di altri sistemi;
   - `INTERNAL_KNOWLEDGE_SYNC_REPOSITORIES` con l'associazione stretta
     prodotto → repository. Per questo repository il valore iniziale è
     `{"hotel-accelerator":"fmancini-create/HotelAccelerator"}`. È una
     configurazione server-side: un repository firmato può aggiornare soltanto
     il proprio prodotto, non le KB degli altri prodotti.
3. In GitHub → repository → Actions secrets, impostare:
   - `INTERNAL_KNOWLEDGE_SYNC_URL`: URL HTTPS production dell'endpoint, ad
     esempio `https://www.hotelaccelerator.com/api/external/knowledge-sync`;
   - `INTERNAL_KNOWLEDGE_SYNC_SECRET`: lo stesso segreto Vercel.
4. Avviare manualmente il workflow **Sync 4BID internal knowledge** su `main`.
5. Da superadmin sul tenant `4bid`, controllare in **Assistente IA** che la
   fonte interna sia `ready`, poi assegnare la base alla route prospect nel
   pannello **Mappa IVR 4 BID**. Il prodotto può usare come primaria soltanto
   la sua fonte interna pronta; le eventuali condivise devono anch'esse essere
   fonti interne pronte del medesimo hub. URL, PDF pubblici e basi di tenant
   non sono selezionabili né tramite interfaccia né tramite API.
6. Provare una domanda presente, una assente e il fallback/trasferimento su
   una chiamata 3CX reale.

Non inserire i segreti in file `.env` versionati, nel manifest, nei documenti
indicizzati, nei log o nelle URL.

## Repository satelliti

L'endpoint riconosce gli stessi quattro `product_key`: `hotel-accelerator`,
`santaddeo-rms`, `hotel-profit-ai`, `manubot`, ma accetta soltanto le coppie
prodotto → repository presenti nella configurazione server-side. Questo
repository invia solo HotelAccelerator. Ogni satellite mantiene repository,
workflow, allowlist e deploy separati e invia una fonte solo per il proprio
prodotto; non accede mai direttamente al database del Core o a basi di un
altro tenant.

Prima di attivare un satellite bisogna verificare repository canonico, branch,
contenuti autorizzati e proprietario del workflow. La sincronizzazione non
crea né modifica cron, webhook, billing, PMS o database del satellite.

## Errori, recovery e rollback

- Firma, timestamp, payload, hash o prodotto non validi: richiesta rifiutata
  senza scrivere dati.
- Segreto o migrazione mancanti: l'endpoint restituisce `503`; la route IVR
  resta non configurata/fallisce chiusa, senza usare un crawler alternativo.
- Errore di embedding o rete: la fonte resta `pending`/`error` e il cron
  `/api/cron/reindex-knowledge` ritenta. La tabella di audit riflette lo
  stato della fonte.
- Rollback applicativo: disattivare il workflow e rimuovere il segreto dal
  repository; le fonti e gli ultimi chunk validi restano leggibili finché non
  si decide esplicitamente di eliminarli.
- Rollback dati, dopo esportazione: rimuovere trigger/funzioni/tabelle della
  migrazione di sync. Non eliminare automaticamente knowledge base o fonti:
  sono contenuto editoriale da gestire con una decisione separata.
