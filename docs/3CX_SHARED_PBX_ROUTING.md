# 3CX condiviso fra tenant: routing del registro chiamate

Ultimo aggiornamento: 2026-08-31

## Stato

`Codice` sul branch `fix/3cx-shared-pbx-journal-routing` fino a collaudo reale. Non promuovere a `Tenant reale` finche' una chiamata al numero 4BID non compare nel tenant 4BID e una chiamata a Villa I Barronci non resta nel tenant Villa I Barronci.

## Perche' esiste

Il caso e' eccezionale: Villa I Barronci e 4BID condividono oggi la stessa istanza 3CX, pur essendo tenant distinti in HotelAccelerator.

3CX consente una sola integrazione CRM server-side per PBX e il suo scenario `ReportCall` non espone il DID chiamato. Di conseguenza HotelAccelerator non puo' decidere il tenant dal numero di destinazione e non deve tentare euristiche basate su contatto, nome, interno o testo.

## Decisione

Il comportamento normale resta invariato: il template CRM autentica un solo tenant e il `ReportCall` viene registrato in quel tenant.

Solo un tenant esplicitamente configurato come utilizzatore dello stesso PBX puo' deviare il journal. La relazione e' salvata in `telephony_integrations.shared_pbx_journal_property_id`.

Quando un endpoint vocale autenticato del tenant condiviso riceve una richiesta:

1. normalizza il numero chiamante usando `phoneMatchKey`;
2. salva/aggiorna un hint backend-only con tenant sorgente, tenant target e orario;
3. se il percorso bot non produce `ReportCall`, crea una `phone_calls` tenant-scoped e ne aggiorna la trascrizione live usando `history + question + speech`;
4. se 3CX invia successivamente `ReportCall`, il journal accetta il cambio tenant solo se l'hint cade nell'intervallo temporale della stessa chiamata e la relazione di PBX condiviso e' ancora valida;
5. se esiste gia' la chiamata creata dal bridge vocale, il journal arricchisce la stessa riga con trascrizione provider, riepilogo, registrazione e sentiment invece di creare un doppione.

Senza relazione esplicita o senza hint valido il journal resta sul tenant autenticato dal template CRM.

## Dati e sicurezza

`telephony_call_route_hints` e' backend-only, ha RLS attiva e nessun grant per `anon` o `authenticated`. Conserva soltanto le ultime cifre normalizzate necessarie al matching, non il testo della conversazione e non segreti.

Il testo della conversazione vive esclusivamente in `phone_calls.transcription`, gia' protetta dal perimetro tenant del modulo telefonate.

La credenziale CRM e la credenziale vocale restano distinte. Il routing non accetta un `property_id` deciso dal browser o dal modello: il target deriva dalla credenziale voce e la relazione con il tenant sorgente e' verificata nuovamente lato server.

## Caso configurato

La migrazione individua i tenant tramite identita' applicative stabili, non UUID hardcoded:

- target: property `slug=4bid`, `type=company`;
- proprietario del journal CRM condiviso: property `slug=villa-i-barronci`, `type=hotel`.

La migrazione non sovrascrive una relazione gia' configurata.

## Idempotenza e retry

L'hint mantiene l'ID della eventuale `phone_calls` sintetica. Un retry dello stesso `ReportCall` continua a risolvere allo stesso tenant attraverso la finestra temporale della chiamata anche dopo `consumed_at`.

Le chiamate successive dello stesso numero non ereditano automaticamente il vecchio routing: `last_seen_at` deve essere successivo all'inizio della nuova chiamata.

## Rollback

Rollback applicativo: ripristinare il journal e gli endpoint voice alla versione precedente. In quel caso il PBX continua a funzionare con il comportamento standard e il tenant del template CRM torna a essere l'unica destinazione del journal.

Rollback dati, dopo aver verificato che nessun altro tenant usi la relazione:

1. azzerare `shared_pbx_journal_property_id` sul tenant condiviso;
2. eliminare `telephony_call_route_hints`;
3. rimuovere `telephony_integrations.shared_pbx_journal_property_id`.

Le righe `phone_calls` gia' create non vanno cancellate automaticamente.

## Collaudo reale richiesto

- chiamare il numero 4BID e parlare con il bot: la chiamata deve apparire sotto 4BID anche se 3CX non emette `ReportCall`;
- verificare che la trascrizione live contenga la conversazione e sia disponibile al motore domanda se il tenant/gruppo la abilita;
- se arriva `ReportCall`, verificare che la stessa riga venga arricchita e non duplicata;
- chiamare Villa I Barronci senza passare dal bot 4BID: la chiamata deve restare sotto Villa I Barronci;
- ripetere il test dallo stesso cellulare in sequenza per escludere leakage fra chiamate;
- verificare log senza numeri completi, segreti o testo della conversazione.

## Evidenza codice

- `supabase/migrations/20260831214500_add_3cx_shared_pbx_routing.sql`
- `lib/telephony/shared-pbx-routing.ts`
- `app/api/telephony/3cx/journal/route.ts`
- `app/api/telephony/3cx/voice/v1/query/route.ts`
- `app/api/telephony/3cx/voice/v1/prospect/route.ts`
- `app/api/telephony/3cx/voice/v1/support/route.ts`
