# AI Video Studio

Stato: `Codice` (2026-08-31). Non promuovere a `Tenant reale` finche' migrazione, segreti e una generazione reale non sono stati verificati.

## Obiettivo

Permettere a un utente dell'area Marketing di descrivere uno spot in linguaggio naturale e avviare da HotelAccelerator la generazione video senza configurare manualmente un tool esterno.

## Flusso v1

1. L'utente apre `/admin/marketing/video` e scrive il brief.
2. Sceglie 16:9 o 9:16, 15/20/30 secondi, 720p/1080p e audio nativo on/off.
3. `lib/marketing/video-director.ts` usa il provider AI centrale tramite Vercel AI Gateway per produrre titolo, storyboard e un master prompt cinematografico.
4. `lib/integrations/byteplus/video.ts` avvia un task Seedance 2.5 con BytePlus.
5. La UI interroga periodicamente lo stato; quando il task e' pronto l'API copia il file in Vercel Blob per non dipendere dall'URL temporaneo del provider.
6. Job, storyboard, provider task ID, stato, errori e output restano tenant-scoped in `ai_video_jobs`.

## Sicurezza e multi-tenancy

- L'area e' protetta dalla stessa guardia `marketing` della sezione Email Marketing.
- `property_id` e' derivato dalla sessione server, mai accettato dal browser.
- `BYTEPLUS_VIDEO_API_KEY` resta esclusivamente server-side.
- La tabella usa RLS tenant-scoped e policy anon deny.
- I log non devono contenere API key o URL firmati completi del provider.
- I file finali sono pubblici su Vercel Blob per poter essere riprodotti/scaricati dal browser; il contenuto video non deve quindi includere dati riservati dell'hotel.

## Variabili ambiente

Obbligatoria:

- `BYTEPLUS_VIDEO_API_KEY`: chiave BytePlus per il servizio video.

Opzionali:

- `BYTEPLUS_VIDEO_API_BASE`: default `https://operator.las.ap-southeast-1.bytepluses.com/api/v1`.
- `BYTEPLUS_VIDEO_MODEL`: default `dreamina-seedance-2-5-260628`.

Restano inoltre necessari i segreti gia' usati dal Core per AI Gateway, Supabase e Vercel Blob.

## Provider contract

L'adapter e' isolato dal resto dell'app. La UI e il database non conoscono il payload BytePlus: un secondo provider potra' essere aggiunto senza cambiare il brief o la regia AI.

Seedance 2.5 accetta task asincroni e supporta durate fino a 30 secondi. Il provider restituisce URL temporanei; per questo il Core tenta immediatamente una copia durevole in Blob quando osserva `succeeded`.

## Limiti v1

- Un job produce un singolo video Seedance; non esiste ancora un montaggio multi-clip server-side.
- I suggerimenti `overlay_hint` del regista non vengono ancora renderizzati automaticamente nel file. Servono a non far inventare scritte/loghi al generatore video.
- Voice-over, musica separata e compositing di loghi/testi sono fuori dalla v1.
- Non esiste ancora quota/costo per tenant: prima di renderlo vendibile va collegato al billing/entitlement.

## Verifica prima di `Tenant reale`

1. applicare `20260831214500_add_ai_video_jobs.sql`;
2. configurare `BYTEPLUS_VIDEO_API_KEY` su Preview;
3. verificare `AI_GATEWAY_API_KEY` e Blob;
4. eseguire typecheck/build/check nav esistenti;
5. generare almeno un 16:9 e un 9:16 reali;
6. verificare che un utente senza area Marketing riceva 403 sull'API;
7. verificare isolamento fra due property;
8. verificare che l'output Blob resti leggibile dopo la scadenza dell'URL BytePlus;
9. misurare costo e tempo medio per 15/30 secondi.

## Rollback

- Rimuovere/disabilitare `BYTEPLUS_VIDEO_API_KEY` per bloccare nuove generazioni senza cancellare lo storico.
- La migrazione e' additiva; la tabella puo' restare inattiva.
- La route fallisce in modo esplicito se la chiave manca e non usa dati mock.
