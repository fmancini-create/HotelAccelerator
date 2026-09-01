# CRM white-label, prospecting addon e workspace operativi

Ultimo aggiornamento: 2026-09-01

## Stato

`Specifica`

Questa specifica definisce due decisioni di prodotto vincolanti per HotelAccelerator Core:

1. il provider esterno di prospecting resta completamente invisibile ai tenant;
2. il CRM non e' un modello unico rigido, ma un motore condiviso configurabile per linee di business/workspace.

## 1. Prospecting B2B come addon white-label HotelAccelerator

### Decisione

HotelAccelerator vende il servizio di ricerca e arricchimento prospect come addon proprietario. Il tenant non deve vedere, in nessuna interfaccia o risposta applicativa, riferimenti al provider sottostante.

Il provider attuale resta un adapter interno sostituibile. Il nome del provider puo' comparire esclusivamente in codice server, configurazione interna, log tecnici riservati al superadmin, documentazione tecnica interna e audit di costo.

### Divieti lato tenant

Non devono comparire:

- nome o logo del provider;
- URL o route leggibili che espongano il provider quando esiste una equivalente route neutra;
- messaggi come "email trovata da <provider>" o "<provider> non disponibile";
- stato sorgente del contatto con nome provider;
- prezzi, crediti o unita' di consumo del provider;
- chiavi, limiti o dettagli del contratto API del provider.

La UI deve usare terminologia HotelAccelerator, ad esempio:

- `Ricerca prospect`;
- `Trova decision maker`;
- `Verifica email`;
- `Email non disponibile`;
- `Servizio prospecting temporaneamente non disponibile`.

### Billing e margine

Il costo interno delle API di prospecting viene trasformato in costo cliente con moltiplicatore commerciale **3x**.

Formula di riferimento:

`prezzo_cliente = costo_provider_effettivo * 3`

Il sistema di billing deve misurare separatamente:

- costo provider effettivo per operazione;
- quantita' fatturabile al tenant;
- prezzo applicato al tenant;
- margine lordo risultante;
- eventuali operazioni a costo provider zero.

Il tenant non vede il costo del provider. Vede solo unita', pacchetto o prezzo HotelAccelerator.

Il modello commerciale finale (pay-per-use, pacchetti, quota inclusa, soglia mensile) resta da definire prima dello stato `Vendibile`, ma il moltiplicatore 3x e' requisito vincolante.

### Isolamento e controllo costi

Ogni utilizzo fatturabile deve essere tenant-scoped, idempotente e auditabile. Un retry tecnico non deve produrre un secondo addebito cliente. Le operazioni senza dato restituito non devono essere fatturate se il provider non genera costo effettivo.

## 2. CRM configurabile per workspace/linea di business

### Decisione

HotelAccelerator mantiene **un solo motore CRM e una sola identita' del contatto**, evitando copie separate del cliente. Sopra il motore comune vengono creati uno o piu' `CRM workspace` tenant-scoped.

Ogni workspace rappresenta una linea di business o un gruppo operativo con logica commerciale propria.

Esempio resort:

- `Hotel`;
- `SPA`;
- `Ristorante`.

Lo stesso ospite puo' appartenere contemporaneamente a tutti e tre senza essere duplicato.

### Oggetti condivisi

Restano comuni al tenant:

- identita' del contatto;
- recapiti e preferenze;
- consenso e disiscrizione;
- conversazioni omnicanale;
- storico generale del rapporto;
- deduplica;
- audit e tenant isolation.

### Oggetti configurabili per workspace

Ogni workspace puo' avere propri:

- nome e icona;
- gruppi/operatori autorizzati;
- pipeline e fasi;
- campi aggiuntivi;
- tag e segmenti;
- regole di assegnazione;
- SLA;
- template;
- automazioni;
- KPI;
- scoring;
- viste e dashboard;
- prodotti/servizi venduti;
- motivi di perdita;
- prossima azione;
- permessi di lettura/scrittura.

### Esempio Resort

#### Workspace Hotel

Orientato a soggiorni e prenotazioni:

`Nuova richiesta -> Da qualificare -> Preventivo -> Follow-up -> Confermata -> Persa`

Dati tipici: date, occupanti, camere, tariffa, trattamento, provenienza, valore soggiorno.

#### Workspace SPA

Orientato a trattamenti e percorsi benessere:

`Richiesta -> Da ricontattare -> Proposta trattamento -> Prenotato -> Eseguito -> Perso`

Dati tipici: trattamento, durata, operatore, data/orario, valore, preferenze.

#### Workspace Ristorante

Orientato a prenotazioni tavolo/eventi:

`Richiesta -> Disponibilita verificata -> Proposta -> Prenotato -> Servito -> Perso`

Dati tipici: coperti, data/orario, occasione, menu, allergie, valore previsto.

## 3. CRM 4BID / superadmin commerciale

Il CRM usato da 4BID non deve essere una semplice copia del CRM ospite dell'hotel. E' un workspace B2B dedicato alla vendita dei prodotti 4BID.

### Prodotti

Deve poter associare al prospect uno o piu' prodotti, almeno:

- HotelAccelerator;
- Santaddeo;
- HotelProfitAI;
- ManuBot;
- eventuali addon presenti e futuri.

Ogni opportunita' deve poter indicare prodotto/i interessati, valore, piano, durata, addon e origine.

### Pipeline 4BID di base

Pipeline raccomandata configurabile:

`Nuovo prospect -> Da contattare -> Contattato -> Email inviata -> Risposta ricevuta -> Demo prenotata -> Demo effettuata -> Proposta inviata -> Trattativa -> Vinto -> Perso`

Le fasi devono essere configurabili, ma il sistema deve mantenere eventi strutturati per distinguere almeno:

- primo contatto;
- email inviata;
- telefonata;
- risposta;
- demo prenotata;
- demo svolta;
- preventivo/proposta;
- follow-up;
- vinto/perso.

### Relazione prospect-prodotto

Un'azienda puo' avere piu' opportunita' contemporanee per prodotti diversi. Esempio: Santaddeo in trattativa e ManuBot ancora da contattare. Non usare un singolo campo `status` globale per rappresentare tutto.

## 4. Modello architetturale raccomandato

Non duplicare la tabella `contacts` per ogni reparto.

Introdurre in modo additivo, dopo audit dello schema reale, concetti equivalenti a:

- workspace CRM tenant-scoped;
- membership contatto-workspace;
- pipeline per workspace;
- stage per pipeline;
- opportunita' collegate a contatto/azienda/workspace;
- prodotti associati all'opportunita';
- gruppi/operatori autorizzati al workspace;
- eventi commerciali strutturati.

I nomi fisici di tabelle e colonne verranno definiti solo dopo verifica dello schema esistente. Questa specifica non autorizza a inventare o sostituire tabelle correnti senza migrazione retrocompatibile.

## 5. Compatibilita' con il CRM esistente

La pipeline alberghiera attuale basata su richieste date non va eliminata. Va trattata come prima specializzazione del workspace `Hotel` e migrata/collegata in modo retrocompatibile.

Il prospecting B2B gia' presente resta una sorgente interna del Motore di Vendita Intelligente, ma deve essere esposto ai tenant solo con branding HotelAccelerator.

## 6. Sicurezza e permessi

- ogni workspace appartiene a un tenant;
- nessun workspace puo' leggere contatti o opportunita' di un altro tenant;
- gruppi e utenti vedono solo i workspace autorizzati;
- il superadmin 4BID non deve trasformarsi implicitamente in utente di altri tenant;
- autorizzazione sempre server-side; RLS come difesa aggiuntiva;
- audit per cambio fase, assegnazione, contatto commerciale e operazioni fatturabili.

## 7. Criteri di accettazione

### White-label prospecting

- nessuna stringa provider visibile in UI tenant;
- nessun errore provider-specifico esposto al tenant;
- sorgente mostrata come HotelAccelerator/prospecting, non provider;
- contabilizzazione tenant-scoped del costo interno e prezzo cliente 3x;
- retry idempotenti senza doppio addebito.

### CRM workspace

- tenant admin puo' creare/configurare almeno due workspace distinti;
- un contatto puo' appartenere a piu' workspace senza duplicazione;
- pipeline, campi e operatori possono differire per workspace;
- operatori non autorizzati non vedono il workspace;
- report e dashboard possono essere filtrati per workspace.

### 4BID

- prospect associabile a piu' prodotti;
- stato/fase per opportunita', non solo per contatto;
- eventi email/demo/proposta registrati separatamente;
- pipeline commerciale 4BID configurabile senza modificare il CRM dei tenant hotel.

## 8. Stato e prossime azioni

- Prospecting provider adapter: `Codice`.
- White-label tenant: `Specifica` finche' non viene completato il de-branding di UI/API/source visibili.
- Billing prospecting 3x: `Specifica`.
- CRM workspace configurabile: `Specifica`.
- CRM 4BID multi-prodotto: `Specifica`.

Prossima implementazione raccomandata:

1. eliminare i riferimenti provider dalle superfici tenant;
2. aggiungere metering interno e contratto billing white-label;
3. audit completo dello schema CRM esistente;
4. migrazione additiva per workspace/pipeline/opportunita';
5. configuratore workspace e permessi;
6. migrare la pipeline hotel corrente come workspace Hotel;
7. configurare il workspace commerciale 4BID e i prodotti della suite.
