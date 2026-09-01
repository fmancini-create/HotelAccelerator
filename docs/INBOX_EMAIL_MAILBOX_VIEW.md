# Inbox — vista Posta email

Ultimo aggiornamento: 2026-09-01

## Stato

`Codice`

La Inbox operativa omnicanale e la vista completa della casella email hanno responsabilita' diverse e non devono condividere lo stesso modello dati.

## Decisione

- `Inbox omnicanale`: continua a leggere le conversazioni operative dal database HotelAccelerator e aggrega Email, WhatsApp, Telegram e Chat.
- `Posta email`: legge direttamente le API Gmail dell'account selezionato per rappresentare fedelmente le cartelle della casella.

La vista `Posta email` espone per ogni casella accessibile:

- Posta in arrivo;
- Speciali;
- Posta inviata;
- Bozze;
- Tutta la posta;
- Spam;
- Cestino;
- ulteriori label di sistema restituite da Gmail;
- tutte le etichette utente restituite da Gmail.

## Perche' Sent/Draft non vengono importati nella Inbox operativa

`EmailProcessor` modella l'email inbound del cliente. Importare i messaggi con label `SENT` o `DRAFT` come inbound produrrebbe falsi messaggi cliente e altererebbe unread, KPI e CRM.

Per questo il full historical sync continua intenzionalmente a saltare `SENT` e `DRAFT`. La loro consultazione avviene nella vista `Posta email`, direttamente dalla sorgente Gmail.

## Multi-account e sicurezza

La UI non riceve token OAuth. Usa le API server esistenti `/api/gmail/channels`, `/api/gmail/labels`, `/api/gmail/threads` e `/api/gmail/threads/[threadId]`, che risolvono la casella accessibile lato server. Il cambio account ricarica cartelle, label e thread della casella selezionata.

## Criteri di collaudo prima di `Tenant reale`

1. entrare in un tenant con almeno due caselle Gmail accessibili;
2. verificare che entrambe compaiano nel selettore account;
3. confrontare Posta inviata, Bozze, Spam, Cestino e almeno una etichetta custom con Gmail;
4. aprire un thread in almeno due cartelle diverse;
5. verificare il comportamento mobile;
6. verificare che la Inbox omnicanale non acquisisca le email inviate come messaggi cliente.

Nessuna migrazione database e' richiesta per questa modifica.
