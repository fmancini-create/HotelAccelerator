# Inbox — cartelle email nella Inbox unica

Ultimo aggiornamento: 2026-09-04

## Stato

`Codice`

HotelAccelerator espone una sola **Inbox** all'utente. La vista operativa omnicanale e la consultazione completa delle cartelle email restano separate soltanto a livello tecnico per non confondere messaggi cliente, posta inviata e bozze.

## Decisione UX

- non esiste piu' un selettore a due modalita' `Inbox omnicanale` / `Posta email`;
- `Inbox` e' il contenitore unico;
- `Cartelle email` e' una sottovista raggiungibile dalla Inbox;
- nella sidebar della vista operativa, subito sotto `Risolti`, `Posta inviata` apre la vista Sent esistente senza diventare uno stato delle conversazioni;
- dalla sottovista email si torna alle `Conversazioni` con una normale azione di navigazione;
- `Nuovo messaggio` vive nel guscio comune della Inbox, sopra la colonna laterale, fuori dallo scroll delle cartelle;
- nessun logo o branding Gmail viene mostrato nell'esperienza tenant: il provider resta un dettaglio tecnico del connettore.

## Modelli dati interni

La semplificazione dell'interfaccia non unifica artificialmente i dati:

- la vista conversazioni continua a leggere le conversazioni operative dal database HotelAccelerator e aggrega Email, WhatsApp, Telegram e Chat;
- la sottovista `Cartelle email` legge direttamente le API della casella selezionata per rappresentare fedelmente le cartelle del provider.

La sottovista email espone per ogni casella accessibile:

- Posta in arrivo;
- Speciali;
- Posta inviata;
- Bozze;
- Tutta la posta;
- Spam;
- Cestino;
- ulteriori label di sistema restituite dal provider;
- tutte le etichette utente restituite dalla casella.

## Perche' Sent/Draft non vengono importati nella Inbox operativa

`EmailProcessor` modella l'email inbound del cliente. Importare i messaggi con label `SENT` o `DRAFT` come inbound produrrebbe falsi messaggi cliente e altererebbe unread, KPI e CRM.

Per questo il full historical sync continua intenzionalmente a saltare `SENT` e `DRAFT`. La loro consultazione avviene nella sottovista `Cartelle email`, direttamente dalla sorgente della casella.

## Multi-account e sicurezza

La UI non riceve token OAuth. Usa le API server esistenti `/api/gmail/channels`, `/api/gmail/labels`, `/api/gmail/threads` e `/api/gmail/threads/[threadId]`, che risolvono la casella accessibile lato server. Il cambio account ricarica cartelle, label e thread della casella selezionata.

La rimozione del branding Gmail e del doppio selettore non modifica ownership, autorizzazione o isolamento tenant.

## Criteri di collaudo prima di `Tenant reale`

1. entrare in un tenant con almeno due caselle email accessibili;
2. verificare che entrambe compaiano nel selettore account;
3. confrontare Posta inviata, Bozze, Spam, Cestino e almeno una etichetta custom con la casella originale;
4. aprire un thread in almeno due cartelle diverse;
5. verificare che `Nuovo messaggio` resti sopra la sidebar e non copra alcuna cartella, anche durante lo scroll;
6. verificare il comportamento mobile;
7. verificare che la Inbox operativa non acquisisca le email inviate come messaggi cliente.

Nessuna migrazione database e' richiesta per questa modifica.
