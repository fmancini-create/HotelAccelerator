# WhatsApp — billing gestito da HotelAccelerator / 4BID

Data: 2026-09-02

## Decisione di prodotto

Il tenant non deve entrare in Meta Business Manager, WhatsApp Manager o Billing Hub per configurare WhatsApp.

Il tenant può soltanto completare il flusso autorizzativo WhatsApp Embedded Signup incorporato in HotelAccelerator, necessario per autorizzare il proprio numero. Dopo il consenso, la piattaforma possiede l'intero workflow operativo:

- associazione WABA/numero al tenant;
- webhook;
- credenziali e segreti;
- template gestiti;
- diagnostica;
- valuta e billing;
- retry e recovery.

La UI tenant non espone WABA ID, Phone Number ID, access token, App Secret, Verify Token, callback Meta o configurazioni di pagamento.

## Modello di billing target

Il modello target è `solution_partner_credit_line`:

1. 4BID possiede la Meta App e il Business Portfolio della piattaforma.
2. Il tenant autorizza il proprio numero tramite Embedded Signup/Coexistence.
3. HotelAccelerator ricerca la linea di credito estesa 4BID tramite Graph API.
4. HotelAccelerator collega la linea al WABA del tenant con `whatsapp_credit_sharing_and_attach`, in EUR.
5. L'allocation config restituita da Meta viene persistita nel canale tenant per idempotenza e audit.
6. Il tenant paga HotelAccelerator/4BID secondo il piano/add-on; non configura un metodo di pagamento Meta.

## Vincolo Meta esterno

La capacità di condividere una linea di credito con WABA cliente dipende dall'abilitazione Meta del Business Portfolio 4BID come Solution Partner e dalla presenza di una extended credit line. HotelAccelerator non può creare programmaticamente un entitlement che Meta non ha concesso.

Se l'entitlement non è disponibile:

- il tenant NON viene inviato su Meta per correggere billing o valuta;
- il canale conserva `platform_billing_status=blocked` o `error`;
- il problema viene registrato nel backend e reso diagnosticabile solo al superadmin;
- il cron proprietario `/api/cron/whatsapp-platform-billing` ritenta la riconciliazione;
- il canale può continuare a ricevere e usare i flussi consentiti, ma i messaggi che richiedono billing/template restano subordinati alla disponibilità Meta.

## Dati

`platform_whatsapp_billing` è una tabella singleton backend-only:

- `business_id`: Business Portfolio 4BID;
- `currency`: EUR;
- `credit_line_id`: extended credit line scoperta da Meta;
- `status`: pending / ready / blocked / error;
- `last_error`, `last_checked_at` per osservabilità.

Nessun segreto è memorizzato nella tabella. I token restano nelle variabili ambiente esistenti.

La configurazione per singolo WABA è salvata in `messaging_channels.config`:

- `platform_billing_managed_by=4bid`;
- `platform_billing_status`;
- `platform_billing_currency`;
- `platform_billing_credit_line_id`;
- `platform_billing_allocation_config_id`;
- `platform_billing_checked_at`;
- `platform_billing_error`.

## Sicurezza e multi-tenant

- `platform_whatsapp_billing`: RLS attiva, nessun grant `anon`/`authenticated`, accesso `service_role` only.
- Il WABA resta associato al `property_id` del tenant.
- La linea di credito è una configurazione di piattaforma e non modifica ownership o routing dei dati.
- La configurazione manuale di token/WABA è recovery platform-only e l'endpoint rifiuta i tenant admin.
- Il cron è protetto da `CRON_SECRET` ed è l'unico owner della riconciliazione periodica.

## Rollback

- disabilitare il cron in `vercel.json`;
- impostare `platform_whatsapp_billing.status=blocked`;
- non rimuovere automaticamente allocation già esistenti senza una procedura Meta esplicita;
- la ricezione WhatsApp e il routing tenant restano separati dal billing.

## Stato

`Codice` finché non sono soddisfatte entrambe le condizioni:

1. CI/build verdi e migrazione applicata;
2. Meta conferma una extended credit line 4BID e almeno un WABA tenant viene collegato con allocation config reale.

Solo dopo un test reale si potrà promuovere questo specifico flusso a `Tenant reale`.
