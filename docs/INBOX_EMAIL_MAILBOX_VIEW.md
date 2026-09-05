# Inbox — vista omnicanale e cartelle email

Ultimo aggiornamento: 2026-09-05

## Stato

`Codice`

HotelAccelerator espone una sola **Inbox** all'utente. La vista operativa omnicanale, la vista **Inviati** omnicanale e la consultazione completa delle cartelle email condividono lo stesso contenitore, ma mantengono fonti tecniche diverse per non confondere messaggi cliente, eventi outbound e cartelle native del provider.

## Decisione UX

- `Inbox` e' il contenitore unico;
- `Inviati` mostra in una sola lista i messaggi outbound registrati da HotelAccelerator, indipendentemente dal canale;
- `Cartelle email` resta una sottovista tecnica per consultare fedelmente le cartelle della singola casella collegata;
- la voce `Posta inviata` dentro `Cartelle email` e' quindi la cartella nativa del provider, non la vista omnicanale `Inviati`;
- da `Inviati` e da `Cartelle email` si torna alle `Conversazioni` con una normale azione di navigazione;
- `Nuovo messaggio` vive nel guscio comune della Inbox, fuori dallo scroll della singola sottovista;
- nessun logo o branding Gmail viene mostrato nell'esperienza tenant: il provider resta un dettaglio tecnico del connettore.

## Modelli dati interni

La semplificazione dell'interfaccia non unifica artificialmente i dati:

- la vista conversazioni continua a leggere le conversazioni operative dal database HotelAccelerator;
- `Inviati` e' una proiezione tenant-scoped dei messaggi realmente registrati in `messages` con `sender_type = agent`, collegati alla conversazione e al relativo canale;
- `Inviati` applica gli stessi limiti di accesso ai canali dell'Inbox: un utente ristretto non puo' leggere outbound di caselle o canali di messaggistica non assegnati;
- la sottovista `Cartelle email` legge direttamente le API della casella selezionata per rappresentare fedelmente le cartelle del provider.

La vista `Inviati` puo' quindi contenere Email, WhatsApp, Telegram, Chat e gli altri canali operativi per i quali esistono effettivamente messaggi outbound persistiti. Non simula invii per integrazioni che non hanno ancora una capability reale.

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

## Perche' la cartella SENT del provider non viene importata nella Inbox operativa

`EmailProcessor` modella l'email inbound del cliente. Importare i messaggi con label `SENT` o `DRAFT` come inbound produrrebbe falsi messaggi cliente e altererebbe unread, KPI e CRM. Inoltre una risposta inviata da HotelAccelerator e gia' registrata nella timeline: importare anche la copia `SENT` del provider la duplicherebbe.

Per questo il full historical sync continua intenzionalmente a saltare `SENT` e `DRAFT`. I messaggi inviati **da HotelAccelerator** compaiono nella vista omnicanale `Inviati`; la cronologia nativa completa della casella, compresi eventuali messaggi inviati direttamente dal provider fuori da HotelAccelerator, resta consultabile in `Cartelle email > Posta inviata`.

Questa separazione e' intenzionale fino a quando non esistera' una proiezione outbound provider-agnostic con deduplica affidabile. Non si devono importare messaggi SENT in `messages` come scorciatoia.

## Multi-account, permessi e sicurezza

La UI non riceve token OAuth. Le cartelle native usano le API server esistenti `/api/gmail/channels`, `/api/gmail/labels`, `/api/gmail/threads` e `/api/gmail/threads/[threadId]`.

La vista `Inviati` usa `/api/inbox/sent`, che ricava il tenant dalla sessione server-side, filtra sempre `messages.property_id` e la property della conversazione e applica le assegnazioni canale gia' usate dalla Inbox. Gli id canale interpolati nei filtri PostgREST vengono accettati soltanto se UUID validi.

## Criteri di collaudo prima di `Tenant reale`

1. entrare in un tenant reale con almeno Email e WhatsApp attivi;
2. inviare un messaggio da HotelAccelerator su almeno due canali e verificare che entrambi compaiano in `Inviati` in ordine cronologico;
3. verificare ricerca, filtro per canale, paginazione e apertura del dettaglio su desktop e mobile;
4. con un utente ristretto, verificare che una casella/canale non assegnato non compaia in `Inviati`;
5. con un secondo tenant, verificare assenza totale di leakage;
6. confrontare `Cartelle email > Posta inviata` con la casella originale e verificare che continui a mostrare anche gli invii fatti fuori da HotelAccelerator;
7. verificare che nessuna email `SENT` venga introdotta come inbound nella Inbox e che unread/KPI non cambino per effetto della nuova vista.

Nessuna migrazione dei dati Inbox e' richiesta. La sola migrazione collegata allo sviluppo registra la capability nella Roadmap SuperAdmin.
