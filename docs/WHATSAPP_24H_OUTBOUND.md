# WhatsApp outbound e finestra 24h

Ultimo aggiornamento: 2026-08-31

## Obiettivo

HotelAccelerator deve impedire che un operatore, una UI o una route interna invii un messaggio WhatsApp free-form quando la customer-care window del singolo cliente è chiusa.

La finestra viene calcolata sulla conversazione del cliente, non su `messaging_channels.last_inbound_at`: il numero business è condiviso da più ospiti e l'ultimo messaggio di un ospite non deve aprire la finestra di un altro.

Il tenant non configura manualmente i template in WhatsApp Manager. HotelAccelerator gestisce una definizione logica standard e la provisiona automaticamente sul WABA autorizzato dal tenant durante Embedded Signup.

## Template standard gestito dalla piattaforma

Nome tecnico:

`hotelaccelerator_nuova_comunicazione`

Lingua:

`it`

Categoria richiesta a Meta:

`MARKETING`

Meta può applicare la propria classificazione finale; HotelAccelerator registra la categoria restituita dall'API senza usarla per aggirare regole di consenso o messaggistica.

Testo:

`L'azienda {{1}} ha una nuova comunicazione per te. Vuoi riceverla qui su WhatsApp?`

`{{1}}` è il nome della property/azienda tenant-scoped. La variabile non è all'inizio o alla fine del template, in linea con la validazione applicata da Meta.

Pulsanti quick reply, nell'ordine:

1. `Apri comunicazione`
2. `Non ora`

I label sono parte del template Meta. HotelAccelerator passa payload opachi per collegare il click alla richiesta corretta senza affidarsi al testo visibile del pulsante.

## Provisioning multi-tenant

Ogni tenant mantiene il proprio WABA. Non esiste un template Meta unico condiviso fisicamente fra aziende diverse.

HotelAccelerator possiede invece una sola definizione applicativa del template e la replica/provisiona sui WABA autorizzati:

1. il tenant avvia `Collega WhatsApp` dentro HotelAccelerator;
2. Meta Embedded Signup restituisce il WABA e il numero autorizzati;
3. HotelAccelerator sottoscrive il WABA al webhook condiviso;
4. `lib/whatsapp/template-provisioning.ts` cerca il template per nome e lingua sul WABA;
5. se esiste, ne salva `id`, `status` e `category` in `messaging_channels.config`;
6. se manca, lo crea via Graph API e salva lo stato restituito, normalmente `PENDING`;
7. il webhook `message_template_status_update` aggiorna automaticamente `APPROVED`, `REJECTED`, `DISABLED`, `FLAGGED` e gli altri stati Meta;
8. prima di un outbound fuori 24h, la compose route ripete la verifica: questo costituisce il retry/self-healing se il provisioning iniziale era fallito o se lo stato era ancora in revisione.

Metadati non segreti salvati per canale:

- `reopen_template_name`
- `reopen_template_language`
- `reopen_template_status`
- `reopen_template_id`
- `reopen_template_category`
- `reopen_template_checked_at`
- `reopen_template_managed_by = hotelaccelerator`
- `reopen_template_provisioning_error`

Token e app secret non entrano in questi campi e non vengono mai esposti al browser.

Se Meta sta ancora revisionando il template, gli invii free-form dentro le 24h continuano a funzionare. Gli outbound business-initiated fuori finestra falliscono chiusi con `TEMPLATE_NOT_READY`; l'operatore non viene invitato ad aprire Meta o a configurare manualmente il tenant.

## Flusso messaggio

### Finestra aperta

1. L'operatore apre `Nuovo messaggio` nella Inbox.
2. Seleziona WhatsApp, cerca/seleziona il contatto o inserisce il numero con prefisso internazionale.
3. Il backend crea o riusa la conversazione WhatsApp corretta per tenant e numero business.
4. `lib/whatsapp/window.ts` cerca l'ultimo messaggio `sender_type = customer` della conversazione.
5. Se sono trascorse meno di 24 ore, il messaggio parte con `sendWhatsAppText` e viene persistito nella timeline.

### Finestra chiusa

1. La compose route verifica automaticamente che il template managed sia `APPROVED`; se manca lo crea e, finché Meta lo revisiona, non tenta un invio non consentito.
2. Il testo dell'operatore viene salvato in `whatsapp_pending_messages` prima di contattare Meta.
3. Parte il template approvato con `{{1}} = properties.name`.
4. La UI mostra `Comunicazione in attesa`.
5. Se il cliente preme `Non ora`, la richiesta passa a `declined` e il testo non viene inviato.
6. Se il cliente preme `Apri comunicazione`, il webhook registra prima il messaggio inbound; questo apre la customer-care window.
7. Il webhook reclama la richiesta con stato `sending`, invia il testo sospeso e poi la marca `sent`.
8. Il messaggio viene inserito nella timeline con `source = whatsapp_reopen_queue`.
9. I quick reply di controllo non vengono passati all'autopilot AI.

## Idempotenza, retry e recovery

La coda usa gli stati:

- `awaiting_acceptance`
- `sending`
- `sent`
- `declined`
- `failed_template`
- `failed_delivery`
- `delivery_unknown`
- `expired`

Esiste al massimo una richiesta attiva per conversazione negli stati `awaiting_acceptance`, `sending`, `failed_delivery`.

Il webhook processa il payload di riapertura anche quando il messaggio inbound è un retry già presente nella Inbox. In caso di rifiuto HTTP esplicito da Meta, `failed_delivery` può essere ripreso dal retry dello stesso evento. Una richiesta già `sent` non viene inviata nuovamente.

`delivery_unknown` è invece terminale e richiede verifica umana. Viene usato quando la connessione cade senza una risposta Meta oppure quando un processo resta in `sending` oltre la finestra di recovery: in entrambi i casi Meta potrebbe avere già accettato il messaggio e un reinvio automatico rischierebbe di duplicarlo. Finché un claim `sending` è recente, il webhook risponde retryable a Meta senza eseguire un secondo send; dopo due minuti lo stato diventa `delivery_unknown` e libera la conversazione da un lock permanente.

Dopo una risposta positiva da Meta, lo stato esterno `sent_message_id` viene registrato prima dell'inserimento nella timeline: in caso di errore DB successivo si preferisce un record locale da riparare a un doppio messaggio al cliente.

Il provisioning del template non usa un cron separato: il lifecycle arriva dal webhook Meta già proprietario degli eventi WhatsApp e la compose route esegue un controllo lazy prima del primo outbound fuori finestra. In questo modo non esistono due automazioni concorrenti per lo stesso stato.

## Firma webhook e compatibilità

Gli Embedded Signup/coexistence usano la Meta app di piattaforma e quindi `META_APP_SECRET`. I canali legacy/manuali possono però essere stati collegati a un'altra Meta app e conservano il proprio `app_secret` cifrato nelle credenziali tenant.

Per non rompere quei tenant quando la piattaforma configura il secret condiviso:

- gli eventi con `phone_number_id` vengono prima instradati al canale tenant corretto;
- una firma valida della app di piattaforma è accettata per i canali Embedded Signup;
- se la firma condivisa non coincide, viene verificato il secret del canale tenant già risolto;
- gli eventi lifecycle del template, che possono non avere `phone_number_id`, modificano lo stato soltanto con firma valida della app di piattaforma;
- un payload senza firma valida non produce scritture Inbox o configurazioni template.

## Sicurezza e tenant isolation

- Ogni WABA resta legato al `messaging_channels` del tenant che lo ha autorizzato.
- Il provisioning usa il `waba_id` restituito dall'Embedded Signup, mai un WABA indicato liberamente dal browser.
- Gli aggiornamenti lifecycle dal webhook sono applicati soltanto dopo verifica `X-Hub-Signature-256` della Meta app della piattaforma.
- Un evento template viene applicato ai canali con lo stesso `waba_id` e al template managed per nome/id.
- `whatsapp_pending_messages` ha RLS abilitata e policy basata su `auth_property_id()` / `auth_is_super_admin()`.
- `anon` non ha accesso alla tabella.
- Tutti gli endpoint operatore verificano l'identità e ricavano `propertyId` lato server.
- Il contatto passato dalla UI viene riletto con `property_id` prima dell'uso.
- Il quick-reply viene accettato solo se `pending.property_id`, `messaging_channel_id` e numero mittente coincidono.
- Nessun segreto WhatsApp viene esposto al browser.
- I forward WhatsApp verso un numero arbitrario non riusano la finestra della conversazione sorgente: devono passare dal composer omnicanale.

## UI

La Inbox espone un solo ingresso visibile `Nuovo messaggio` con due canali:

- Email: usa il compose Gmail esistente.
- WhatsApp: usa `/api/inbox/compose/whatsapp` e applica la protezione 24h.

Il vecchio pulsante `Scrivi` email-only è ritirato a livello route-scoped per evitare due significati diversi di “nuovo messaggio”.

La UI è responsive (`DialogContent` con limite `92dvh`, launcher accessibile da smartphone).

Il tenant non deve vedere istruzioni del tipo “vai in Meta e crea un template”. Se il managed template è ancora `PENDING` o ha un errore, l'interfaccia deve presentarlo come stato tecnico del canale gestito da HotelAccelerator.

## Endpoint

- `GET /api/inbox/compose/contacts?q=...`: ricerca minima di nome/email/telefono nel tenant dell'operatore, senza richiedere il modulo CRM completo.
- `POST /api/inbox/compose/whatsapp`: crea o riusa contatto/conversazione, decide invio immediato vs template e verifica/provisiona lazy il template managed.
- `POST /api/channels/whatsapp/embedded-signup`: collega il WABA/numero e provisiona automaticamente il template standard.
- `POST /api/channels/whatsapp/webhook`: gestisce inbound, quick reply di riapertura e lifecycle `message_template_status_update`.

## Migrazioni

- `supabase/migrations/20260831162757_add_whatsapp_pending_messages.sql`
- `supabase/migrations/20260831213000_harden_whatsapp_pending_delivery_recovery.sql`

La prima migrazione additiva è già applicata al progetto Supabase HotelAccelerator il 2026-08-31. La seconda aggiunge soltanto lo stato terminale `delivery_unknown`; non elimina dati né cambia il perimetro RLS.

Il provisioning template non richiede nuove colonne: lo stato lifecycle non sensibile vive nel JSONB `messaging_channels.config`, già tenant-scoped.

## Rollback

Rollback applicativo sicuro:

1. ripristinare le route/client/UI precedenti;
2. lasciare la tabella `whatsapp_pending_messages` presente ma inutilizzata, così nessun dato/audit viene perso;
3. lasciare i template già creati sui WABA: sono innocui se non referenziati e la loro cancellazione automatica non fa parte del rollback;
4. non rimuovere la tabella finché esistono richieste in `awaiting_acceptance`, `sending` o `failed_delivery`;
5. conservare eventuali righe `delivery_unknown` per audit: cancellarle renderebbe impossibile ricostruire un invio dall'esito incerto.

La rimozione fisica della tabella o dei template Meta è distruttiva e richiede una decisione separata.

## Stato ufficiale

- Composer omnicanale Email/WhatsApp: `Codice` finché non viene collaudato su tenant reale.
- Enforcement server-side finestra 24h: `Codice`.
- Provisioning automatico template per-WABA: `Codice` finché non viene provato con un Embedded Signup reale e confermato il lifecycle Meta.
- Flusso end-to-end fuori 24h: non promuovere oltre `Codice` senza prova reale di `APPROVED`, ricezione template e click cliente.
