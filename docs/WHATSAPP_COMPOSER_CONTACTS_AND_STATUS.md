# WhatsApp composer: numeri, rubrica e stato consegna

Ultimo aggiornamento: 2026-09-01

## Obiettivo

Il composer WhatsApp della Inbox deve rendere espliciti tre comportamenti che il backend gestiva gia' solo in parte o in modo non visibile:

1. formato del numero con prefisso internazionale;
2. salvataggio tenant-scoped di un numero nuovo nella rubrica CRM;
3. esito asincrono della consegna del template fuori finestra 24h.

## Formato numero

La UI indica come formato consigliato `+39 324 892 6753` e accetta anche la forma senza segni `393248926753`.
Spazi, trattini e parentesi non cambiano l'identita' del numero perche' il backend normalizza alle sole cifre prima della chiamata WhatsApp.
Il prefisso internazionale resta obbligatorio per evitare numeri ambigui.

## Numero non presente in rubrica

La ricerca continua a usare `/api/inbox/compose/contacts` nello scope del tenant autenticato.
Quando l'operatore inserisce un numero WhatsApp valido che non corrisponde ai suggerimenti della rubrica, il composer mostra un campo `Nome contatto (opzionale)`.

Non viene creata una seconda rubrica: `POST /api/inbox/compose/whatsapp` riusa la tabella `contacts` gia' proprietaria del CRM e la funzione di riconoscimento numero esistente. Se nessuna anagrafica e' riconosciuta, crea una sola scheda con:

- `property_id` del tenant autenticato;
- `phone` in formato internazionale;
- `whatsapp_id` normalizzato;
- `source = manual`;
- nome inserito dall'operatore, oppure il numero come fallback.

## Stato del template fuori 24h

Dopo la creazione di una riga in `whatsapp_pending_messages`, il composer conserva il `pendingId` e interroga `GET /api/inbox/compose/whatsapp/status?pendingId=...`.

L'endpoint:

- richiede identita' operatore;
- filtra sempre per `property_id`;
- non espone righe di altri tenant;
- restituisce solo stato, errore e timestamp non sensibili.

Stati terminali gestiti dalla UI:

- `sent`: il cliente ha accettato e il messaggio sospeso e' stato inviato;
- `declined`: il cliente ha rifiutato;
- `failed_template`: Meta non ha consegnato il template;
- `failed_delivery`: Meta non ha consegnato il messaggio successivo;
- `delivery_unknown`: esito incerto, niente reinvio automatico;
- `expired`: richiesta scaduta.

In caso di errore Meta, la UI mostra `last_error` registrato dal webhook. Il test reale del 2026-09-01 sul tenant Villa I Barronci ha prodotto `131042`: valuta del WhatsApp Business Account non configurata. Questo dimostra che il mancato recapito osservato non dipendeva dal formato `+39`/spazi.

## Stato ufficiale

- Salvataggio numero nuovo nella rubrica CRM: `Codice`.
- Monitoraggio visuale del pending WhatsApp: `Codice`.
- Non promuovere oltre `Codice` senza build/typecheck verdi e un nuovo invio reale dopo la configurazione della valuta WABA.

## Rollback

Il rollback e' solo applicativo: rimuovere il polling UI e la relativa route GET. Non sono introdotte migrazioni, tabelle, cron o webhook aggiuntivi. Le anagrafiche gia' create restano normali record CRM tenant-scoped.
