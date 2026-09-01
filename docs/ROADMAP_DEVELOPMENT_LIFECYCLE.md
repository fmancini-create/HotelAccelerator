# Roadmap development lifecycle

## Perche esiste

La roadmap SuperAdmin non e solo documentazione tecnica: e' la memoria operativa del founder. Deve permettere di vedere in pochi secondi cosa e' da iniziare, cosa e' in sviluppo, cosa e' bloccato, cosa e' stato abbandonato e cosa e' arrivato realmente online.

## Regola vincolante

Ogni nuova funzionalita, modulo, integrazione, addon o sviluppo dedicato viene registrato nella tabella `platform_product_roadmap` nello stesso momento in cui parte il branch/PR.

Non aspettare la fine del lavoro per aggiungere la riga.

## Stati lavoro

- `planned` → **Da fare**: deciso/specificato ma sviluppo non partito.
- `in_progress` → **In sviluppo**: esiste un lavoro attivo su branch/PR.
- `blocked` → **Bloccato**: il lavoro e' attivo ma non puo' proseguire per una dipendenza concreta.
- `abandoned` → **Abbandonato**: si e' deciso di non completarlo. La riga resta visibile come memoria storica.
- `completed` → **Online**: lo specifico deliverable e' stato mergiato in `main`, i controlli pertinenti sono verdi ed e' presente nel deploy produzione verificato.

## Verde / Online

`completed` e `online_ready=true` sono legati da vincoli database. Il verde non e' selezionabile manualmente dalla pagina SuperAdmin.

La sequenza corretta e':

1. richiesta di sviluppo;
2. trovare la riga esistente o crearla;
3. impostare `in_progress`, branch e data avvio;
4. aprire la PR e salvare il numero PR;
5. sviluppare e verificare;
6. merge in `main` solo con controlli pertinenti verdi;
7. verificare il deploy produzione;
8. impostare insieme `code_ready=true`, `online_ready=true`, `development_status='completed'` e `completed_at`;
9. solo a questo punto la riga diventa verde.

Se il lavoro si ferma definitivamente, impostare `abandoned`. Se puo' riprendere ma c'e' un impedimento, impostare `blocked`.

## Stato lavoro vs maturita tecnica

Lo stato lavoro risponde a: **"a che punto e' questo sviluppo?"**.

Il livello tecnico ufficiale risponde a: **"quanto e' realmente maturo?"** e usa esclusivamente:

`Idea` · `Specifica` · `UI/mock` · `Codice` · `Demo` · `Tenant reale` · `Multi-tenant` · `Production-ready` · `Vendibile`.

Una funzione puo' quindi essere verde/Online perche' il deliverable e' in produzione ma restare, per esempio, a livello `Codice` finche' non viene collaudata su tenant reale.

## Cosa NON va registrato come nuova riga

Bugfix, refactor o manutenzione che non introducono e non avviano una capability di prodotto possono usare `Roadmap: N/A` nella PR. Se invece il fix e' parte di un deliverable ancora aperto, aggiornare la riga di quel deliverable.

## Evidenza PR

Ogni PR deve dichiarare nel body:

- `Roadmap-Key: <chiave>` per sviluppo prodotto; oppure
- `Roadmap: N/A — <motivo>` per manutenzione pura.

Il branch e il numero PR restano memorizzati sulla riga anche dopo il completamento o l'abbandono.

## Audit e sicurezza

La tabella resta backend-only con RLS e service-role. Ogni modifica di flag tecnici, stato lavoro, branch o PR viene registrata nel relativo audit con `updated_by_email` obbligatorio.

## Rollback

La migrazione e' additiva. In caso di rollback applicativo, le nuove colonne possono restare nel database senza impatto sulle vecchie letture. Non cancellare le righe abbandonate: sono parte della memoria decisionale del prodotto.
