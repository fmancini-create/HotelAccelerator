# 4BID Fiscal Hub

Ultimo aggiornamento: 2026-09-05

## Decisione vincolante

**HotelProfitAI e' l'unico fiscal owner della suite 4BID.** Le piattaforme satellite generano eventi economici/fiscali, ma non possiedono il ciclo FattureInCloud/SDI.

Flusso canonico:

`Piattaforma 4BID -> HotelProfitAI -> FattureInCloud -> invio SDI manuale in FattureInCloud -> HotelProfitAI`

Responsabilita':

- **Piattaforma satellite:** incasso/entitlement e produzione dell'evento fiscale con riferimenti stabili a tenant, cliente, prodotto, pagamento e documento Stripe. Non crea direttamente fatture in FattureInCloud e non invia allo SDI.
- **HotelProfitAI:** riceve e deduplica l'evento; crea una sola fattura in FattureInCloud; conserva gli identificativi di riconciliazione; sincronizza successivamente il documento e lo stato SDI da FattureInCloud; espone errori, retry e audit.
- **FattureInCloud:** provider di fatturazione elettronica e canale verso SDI. Per le fatture clienti ordinarie l'invio a SDI resta un'azione manuale in FattureInCloud.

## Contratto minimo cross-suite

Ogni pagamento fatturabile deve essere riconoscibile senza euristiche. Quando Stripe e' il motore di incasso, la Stripe Invoice deve trasportare almeno un `project` canonico e riferimenti stabili al dominio/tenant e al tipo di operazione. La stessa operazione non deve produrre piu' documenti fiscali su retry o ridelivery.

Identificativi da preservare nel ciclo di vita: ID evento fiscale interno, Stripe Invoice ID quando applicabile, ID documento FattureInCloud e riferimenti tenant/cliente/prodotto. I segreti FattureInCloud appartengono a HotelProfitAI, non ai client o ai satelliti.

## Sincronizzazione di ritorno

Dopo la creazione in FattureInCloud e dopo l'eventuale invio manuale allo SDI, HotelProfitAI deve aggiornare **la stessa fattura**, non crearne una nuova. Il modello di stato deve distinguere almeno creazione FIC, attesa invio, invio, esito/consegna e scarto/errore quando tali informazioni sono disponibili dal provider.

## Stato verificato al 2026-09-05

- **HotelProfitAI:** `Codice` per bridge Stripe -> FattureInCloud, idempotenza su Stripe Invoice e pull dei documenti emessi/ricevuti da FattureInCloud.
- **Normalizzazione affidabile dello stato SDI nel registro fiscale centrale:** non ancora dimostrata; resta da completare/verificare prima di `Production-ready`.
- **HotelAccelerator:** esiste ancora codice legacy che puo' creare documenti FattureInCloud direttamente e anche richiedere invio SDI. E' un conflitto architetturale da migrare in modo controllato, non il target.

## Regola di migrazione

Non rimuovere un percorso fiscale satellite finche' il percorso equivalente HotelProfitAI non e' verificato end-to-end con idempotenza, retry, osservabilita' e riconciliazione. Il cutover deve essere effettuato una piattaforma alla volta, con possibilita' di rollback e senza finestre in cui una fattura possa essere persa o duplicata.

## Definition of Done

La suite puo' considerare il flusso `Production-ready` solo quando, per ogni prodotto attivo: un pagamento/evento produce una sola fattura in FattureInCloud tramite HotelProfitAI; nessun satellite invia automaticamente fatture ordinarie allo SDI; un invio manuale effettuato in FattureInCloud rientra in HotelProfitAI sullo stesso documento con stato aggiornato; retry/ridelivery non duplicano; errori e scarti sono visibili e recuperabili.