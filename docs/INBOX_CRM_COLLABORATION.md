# Inbox — stato CRM e collaborazione operatore

Ultimo aggiornamento: 2026-09-06

## Stato

`In sviluppo` — PR #460.

La Inbox consente di lavorare una conversazione senza creare una seconda fonte di verita' rispetto al CRM. Il selettore mostrato nella conversazione aggiorna il record CRM gia' esistente; la collaborazione fra operatori usa il lock della Inbox gia' presente e aggiunge soltanto coassegnazioni esplicite.

## Regole UX

- Aprire una conversazione non la blocca: il lock nasce quando un operatore inizia realmente a lavorarla/scrivere.
- Il titolare del lock puo' rispondere normalmente.
- Un altro operatore puo' leggere la conversazione ma il composer e' in sola lettura e mostra chi la sta gestendo.
- Se un operatore autorizzato sta digitando, gli altri vedono `sta scrivendo...`.
- Il titolare puo' usare `Consenti collaborazione` per aggiungere uno o piu' coassegnatari.
- Un coassegnatario puo' scrivere e inviare, ma la responsabilita' principale resta al titolare del lock.
- Al termine di un invio riuscito il lock e le coassegnazioni collegate vengono chiusi.
- In caso di uscita/disconnessione continua a valere il meccanismo esistente di heartbeat, rilascio `pagehide` e scadenza per inattivita'.

Assegnazione CRM e lock operativo sono concetti diversi: l'assegnazione indica chi e' responsabile della trattativa; il lock indica chi la sta lavorando in quel momento.

## Stato prospect/lead dalla Inbox

Non esiste una colonna `lead_status` duplicata nella Inbox.

L'endpoint `/api/inbox/[conversationId]/crm-state` risolve la fonte autorevole in questo ordine:

1. se la conversazione ha righe in `contact_date_requests`, usa la richiesta commerciale piu' recente e le fasi canoniche della pipeline (`da_qualificare`, `aperta`, `preventivo_inviato`, `confermata`, `persa`);
2. altrimenti cerca un record `crm_apollo_prospects` collegato allo stesso contatto o alla stessa email e usa `sales_stage`;
3. se non esiste alcun record CRM collegabile, la Inbox non inventa uno stato e non mostra un selettore fittizio.

Per `contact_date_requests`, il cambio fase continua ad aggiornare anche la sales attribution con la stessa logica della pipeline CRM. Ogni cambio dalla Inbox viene auditato come `crm_stage_changed`.

## Lock e coassegnazione

Il lock principale rimane in `conversation_locks`, con unicita' su `(property_id, target_kind, target_key)`. La nuova tabella `conversation_coassignments` contiene soltanto utenti autorizzati a collaborare con il titolare del lock corrente.

Una coassegnazione contiene sempre `holder_key`: quindi non puo' sopravvivere semanticamente al cambio titolare. Inoltre la FK verso il lock usa `ON DELETE CASCADE`, per cui il rilascio del lock elimina automaticamente le coassegnazioni relative.

La tabella e' backend-only: `anon` e `authenticated` non hanno privilegi diretti; le operazioni passano dalle route Core tenant-scoped.

## Enforcement server-side

La sola lettura del composer e' un aiuto UX, non il confine di sicurezza.

Prima di ogni invio:

- `/api/inbox/[conversationId]/send` chiama la guardia collaborativa;
- `/api/gmail/threads/[threadId]/reply` applica la stessa guardia;
- se il lock e' libero, l'operatore puo' prenderlo;
- se il lock appartiene allo stesso operatore, viene rinnovato;
- se appartiene a un altro, l'invio e' ammesso solo se l'utente compare tra i coassegnatari di quel preciso lock;
- in caso contrario la route risponde con conflitto e il messaggio non parte.

Questa regola impedisce doppie risposte anche se un client manomette o bypassa i controlli visivi.

## Segnale di digitazione

`typing_at` e' separato dal normale heartbeat. Serve solo a mostrare chi sta scrivendo in quel momento e viene considerato recente per pochi secondi. Il heartbeat continua invece a determinare la vitalita' del lock.

## Audit

`conversation_activity_log` accetta anche:

- `coassignment_granted`;
- `coassignment_revoked`;
- `crm_stage_changed`.

Gli invii continuano a registrare `message_sent`, includendo il ruolo collaborativo (`holder` o `collaborator`).

## Canali

La guardia e' provider-agnostic per le conversazioni operative e viene applicata all'endpoint multicanale comune. La risposta Gmail diretta ha la stessa protezione sul bersaglio `gmail_thread`.

Il selettore CRM viene mostrato sulle conversazioni operative che possono essere collegate in modo deterministico a un record CRM. La consultazione tecnica di una cartella nativa Gmail resta una vista provider e non crea da sola una trattativa CRM.

## Criteri prima di dichiarare Online

1. typecheck Core e CI verdi;
2. preview Vercel pronta;
3. due utenti dello stesso tenant: A scrive, B vede sola lettura e non puo' inviare;
4. A coassegna B, B puo' inviare e A vede il segnale di digitazione;
5. rilascio/scadenza: un nuovo utente puo' prendere il lock;
6. cambio stato dalla Inbox riflesso immediatamente nella pipeline CRM e viceversa;
7. prova su due tenant per assenza di leakage;
8. merge su `main` e deploy produzione verificato.
