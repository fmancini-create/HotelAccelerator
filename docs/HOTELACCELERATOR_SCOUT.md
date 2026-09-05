# HotelAccelerator Scout

Ultimo aggiornamento: 2026-09-05

## Stato

- Nome prodotto e contratto white-label: `Specifica`
- Ricerca B2B sottostante: `Codice`
- Company Scout / Agency Scout UI: `Codice`
- Guest Scout: `Specifica`
- Add-on a pagamento, saldo crediti, checkout e ledger: `Codice` sul branch `feat/scout-paid-addon-credits`
- Dashboard economics superadmin: `Codice` sul branch `feat/scout-paid-addon-credits`
- Monitoraggio live dei crediti del provider nel superadmin: `Codice` sul branch `feat/scout-paid-addon-credits`
- Verifica con pagamento reale, webhook reale e migrazioni applicate: non ancora oltre `Codice`

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

Scout e' un add-on HotelAccelerator distinto dal piano base.

### Modello commerciale

1. attivazione una tantum;
2. numero configurabile di crediti Scout inclusi nell'attivazione;
3. successivi acquisti di crediti a consumo;
4. saldo residuo sempre visibile nelle schermate Scout;
5. operazioni gratuite (ricerca, salvataggio e import CRM) non scalano crediti;
6. l'enrichment email riserva e poi consuma un credito Scout solo quando il provider ha eseguito l'operazione.

Il prezzo non usa piu' un moltiplicatore hardcoded. Il superadmin configura:

- fee di attivazione;
- crediti inclusi;
- acquisto minimo;
- moltiplicatore commerciale;
- costo monetario stimato del provider per operazione, con storico e decorrenza.

Per l'operazione corrente:

`prezzo_credito_scout = arrotonda_al_centesimo(costo_provider_stimato * moltiplicatore_superadmin)`

Il costo provider e' salvato in micro-euro per non perdere precisione. Ogni variazione crea una nuova riga storica: i vecchi consumi mantengono costo, moltiplicatore e valore commerciale validi al momento dell'uso.

Il costo monetario configurato e' una stima interna e non deve essere confuso con il numero di crediti tecnici effettivamente consumati dal piano del provider.

### Monitoraggio provider

Il superadmin legge in tempo reale, tramite endpoint provider server-side, i contatori del piano disponibili senza consumo aggiuntivo:

- limite per tipo di credito;
- crediti consumati;
- crediti residui;
- inizio e fine del ciclo corrente.

I contatori tecnici restano separati dal costo monetario configurato. Il loro scopo e' individuare rapidamente esaurimenti, variazioni di consumo o cambi del piano e consentire al superadmin di aggiornare costo stimato e moltiplicatore senza modificare il contratto tenant.

Un errore del monitoraggio provider non deve bloccare la dashboard economics, il checkout o Scout: viene degradato a stato non disponibile e loggato server-side.

### Idempotenza e concorrenza

Le operazioni a consumo usano una riserva atomica tenant-scoped. Il flusso e':

1. verifica entitlement Scout;
2. verifica crediti disponibili;
3. riserva 1 credito per il prospect;
4. esegue il provider;
5. se il provider fallisce prima di completare, rilascia la riserva;
6. se il provider completa, contabilizza il credito e il costo;
7. doppi click e richieste concorrenti sullo stesso prospect non generano due consumi.

Checkout e webhook usano idempotency key legate alla Stripe Checkout Session, cosi' una ridelivery del webhook non accredita due volte i crediti.

### Visibilita'

Il tenant vede esclusivamente:

- stato attivazione Scout;
- fee di attivazione;
- eventuali crediti inclusi;
- saldo totale, riservato e disponibile;
- prezzo di vendita per credito;
- quantita' minima acquistabile.

Non vede costo provider, nome provider, contratto provider, contatori del piano provider, moltiplicatore o margine.

Il superadmin vede invece costo corrente e storico, moltiplicatore, prezzo risultante, margine unitario, crediti acquistati/concessi/consumati, costo provider stimato contabilizzato, valore commerciale degli utilizzi per tenant e contatori live del piano provider.

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

La migrazione mantiene Scout attivo per il tenant interno `slug=4bid`, ma non assegna crediti arbitrari: anche l'uso interno deve essere contabilizzato per conoscere il costo reale del servizio.

## Compatibilita'

Nomi tecnici legacy di adapter, tabelle e identificativi possono restare invariati internamente per evitare migrazioni cosmetiche rischiose, purche' nessuna superficie tenant li esponga. Le nuove route/UI tenant-facing usano naming `Scout`.

Le nuove tabelle sono additive e non modificano `crm_apollo_prospects`, `crm_scout_searches`, `contacts` o il contratto degli altri moduli. `tenant_modules` resta la fonte unica dell'entitlement.

## Rollback

Prima del merge la modifica e' confinata al branch. Dopo l'applicazione delle migrazioni, un rollback applicativo puo' disabilitare il modulo `scout` senza cancellare ledger o storico costi. I dati economici e di audit non devono essere eliminati durante un rollback operativo.

## Definition of Done del white-label

Il white-label Scout puo' passare da `Specifica` a `Codice` solo quando una ricerca globale delle superfici tenant non trova il nome del provider in UI, CTA, errori o sorgenti visualizzate. La presenza del nome in codice server, migrazioni storiche, log interni e documentazione tecnica riservata non costituisce violazione.

Il billing non passa oltre `Codice` finche' non sono verificati almeno: migrazioni su ambiente controllato, checkout Stripe reale/test, ridelivery webhook, tenant isolation, consumo/rimborso credito, pagamento fallito, documentazione fiscale, typecheck/test/build e preview UI mobile.
