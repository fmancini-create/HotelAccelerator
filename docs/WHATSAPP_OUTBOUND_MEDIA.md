# Invio media WhatsApp dalla Inbox

HotelAccelerator consente dal composer omnicanale di inviare tramite WhatsApp:

- foto JPG/PNG;
- video MP4/3GP;
- audio e vocali;
- PDF e principali documenti Office.

## Flusso

1. Il browser chiede al backend un upload firmato, gia limitato a tenant e canale WhatsApp.
2. Il file viene caricato direttamente nel bucket privato `support-private`, senza transitare nel body della Function Vercel.
3. Se la finestra WhatsApp 24h e aperta, il backend carica il file sul Media endpoint Meta e lo invia usando il media ID restituito.
4. Se la finestra e chiusa, HotelAccelerator invia il template di riapertura e conserva il riferimento al media nella coda esistente. Dopo l'accettazione del cliente il media parte automaticamente.
5. Dopo l'invio il file temporaneo viene eliminato. La timeline usa il media ID Meta attraverso il proxy autenticato gia usato per i media ricevuti.

## Vocali

Il pulsante microfono usa `MediaRecorder`. Quando il browser produce OGG/Opus, il messaggio viene marcato come voice note nativa WhatsApp. Se il browser registra in MP4, viene inviato come normale audio WhatsApp invece di fallire.

## Sicurezza

- Nessun access token Meta viene esposto al browser.
- Il path temporaneo include `property_id` e `messaging_channel_id` ed e rivalidato dal server prima dell'invio.
- Il bucket e privato.
- Un tenant non puo usare un media temporaneo appartenente a un altro tenant o a un altro canale WhatsApp.
