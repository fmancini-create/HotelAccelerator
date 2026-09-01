# HotelAccelerator Scout

Ultimo aggiornamento: 2026-09-01

## Stato

- Nome prodotto e contratto white-label: `Specifica`
- Ricerca B2B sottostante: `Codice`
- Company Scout / Agency Scout UI: `Codice` dopo merge della PR che introduce questa pagina
- Guest Scout: `Specifica`
- Billing addon con markup 3x: `Specifica`

## Nome canonico

**HotelAccelerator Scout** e' il nome commerciale e tenant-facing del motore di ricerca e acquisizione di nuovi contatti e partner.

Il provider dati sottostante e' un dettaglio interno sostituibile e non deve essere mostrato ai tenant.

## Famiglie Scout

### Company Scout

Trova aziende e relativi decision maker utili per corporate, eventi, convenzioni e altre opportunita' B2B dell'hotel.

### Agency Scout

Trova agenzie di viaggio, tour operator, DMC e altri intermediari/partner commerciali rilevanti.

### Guest Scout

Trova o genera opportunita' di acquisizione ospiti tramite sorgenti compatibili con privacy, consenso, termini provider e normativa applicabile.

Guest Scout non deve essere presentato come operativo fino a quando non esiste una sorgente verificata e un flusso conforme. Non va simulato usando dati B2B.

## Regola white-label

Nei tenant non devono comparire:

- nome del provider dati;
- logo del provider;
- crediti o prezzi del provider;
- chiavi o nomi di variabili ambiente;
- errori provider-specifici;
- sorgenti contatto che rivelino il provider;
- link o CTA con branding del provider.

Terminologia consentita:

- HotelAccelerator Scout;
- Company Scout;
- Agency Scout;
- Guest Scout;
- Cerca con Scout;
- Verifica email;
- Crediti Scout;
- Servizio Scout temporaneamente non disponibile.

## Billing

Scout e' un addon HotelAccelerator.

Il prezzo cliente deve preservare il requisito commerciale:

`prezzo_cliente = costo_provider_effettivo * 3`

Ogni evento fatturabile deve essere tenant-scoped, idempotente e auditabile. I retry tecnici non generano un secondo addebito. Un'operazione senza costo provider non genera costo variabile cliente salvo futura quota fissa/pacchetto esplicitamente definita.

Il tenant vede solo prezzi, pacchetti e crediti Scout; non il costo o il contratto del provider.

## Relazione con il CRM

Scout alimenta il CRM senza diventare il CRM.

- il prospect nasce in una coda tenant-scoped;
- la ricerca non crea automaticamente un contatto CRM;
- l'operatore sceglie quali prospect salvare e verificare;
- l'import nel CRM resta esplicito;
- consenso marketing e base giuridica non vengono dedotti dalla provenienza Scout;
- i workspace CRM decidono pipeline, proprietari, campi e follow-up successivi.

## 4BID

Per il workspace commerciale 4BID, Scout puo' alimentare prospect per HotelAccelerator, Santaddeo, HotelProfitAI, ManuBot e addon futuri. Il prospect puo' avere opportunita' distinte per piu' prodotti e fasi commerciali differenti.

## Compatibilita'

Nomi tecnici legacy di adapter, tabelle e identificativi possono restare invariati internamente per evitare migrazioni cosmetiche rischiose, purche' nessuna superficie tenant li esponga. Le nuove route/UI tenant-facing usano naming `Scout`.

## Definition of Done del white-label

Il white-label Scout puo' passare da `Specifica` a `Codice` solo quando una ricerca globale delle superfici tenant non trova il nome del provider in UI, CTA, errori o sorgenti visualizzate. La presenza del nome in codice server, migrazioni storiche, log interni e documentazione tecnica riservata non costituisce violazione.
