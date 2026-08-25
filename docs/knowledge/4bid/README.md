# Fonti interne 4BID per gli agenti vocali

Questa cartella definisce quali documenti del repository possono diventare
contenuto delle knowledge base 4BID. Non contiene URL pubblici, crawler o
credenziali.

`manifest.json` e' una allowlist: solo i file elencati sono letti dallo script
`scripts/sync-4bid-internal-knowledge.mjs`. Lo script concatena i documenti,
invia il testo firmato all'endpoint backend e l'applicazione lo indicizza come
fonte `text` interna. I percorsi restano metadati di audit; non fanno parte del
contenuto recuperabile dall'agente.

## Regole di pubblicazione

- Inserire soltanto documentazione verificata e utile a clienti o operatori.
- Non inserire segreti, dati personali, token, log, dump di database o codice
  sorgente indiscriminato.
- Aggiornare la documentazione di prodotto nello stesso PR della modifica
  funzionale: dopo il merge su `main` il sync calcola la nuova impronta e
  reindicizza solo se il contenuto e' cambiato.
- Una voce di manifest rappresenta una singola sorgente per prodotto. Il
  backend accetta soltanto i product key previsti e percorsi Markdown
  repository-relative; l'allowlist resta responsabilità del workflow del repo
proprietario.

Il backend confronta inoltre il repository firmato con l'associazione
prodotto → repository configurata solo sul server. Il possesso del segreto non
autorizza quindi questo repository a modificare le fonti di Santaddeo,
HotelProfitAI o ManuBot.

## Repository satelliti

Questo repository sincronizza solo HotelAccelerator. Santaddeo, HotelProfitAI
e ManuBot hanno repository e deploy separati: ciascuno deve usare lo stesso
payload firmato verso `/api/external/knowledge-sync`, indicando il proprio
`product_key`. Non va copiato codice o dati fra database per alimentare la KB.
