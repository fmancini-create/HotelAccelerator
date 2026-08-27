# HotelAccelerator — Integrations Registry

Ultimo aggiornamento: 2026-08-27

## Regola

Questo registro distingue intenzione e prova. `Da verificare` significa che una conversazione ne segnala l'esistenza o l'interesse, ma non è stato completato un audit di codice, credenziali, test e produzione.

| Dominio | Provider/canale | Scopo | Stato | Vincoli/prossima verifica |
|---|---|---|---|---|
| Hosting | Vercel | Deploy applicazioni | Da verificare | Inventariare progetti, ambienti e domini |
| Dati/auth | Supabase | Database, Auth, RLS, storage | Da verificare | Audit progetti, policy, migrazioni e service role |
| Codice | GitHub | Repository e CI | Presente | Definire branch policy, CI e documenti mancanti |
| PMS | Scidoo | Camere, disponibilità, tariffe, produzione, push prezzi | Da verificare | Test mapping, retry, idempotenza e tenant reale |
| Browser remoto | Browserbase | PMS interattivo incorporato e login persistente per tenant | Codice | Configurazione agnostica separata dai connettori API; route, Context tenant-aware, Live View e fallback diretto implementati. Collaudare un login reale e misurare durata/costi prima di `Tenant reale` |
| Email | Gmail | Inbox email | Tenant reale | Villa I Barronci verificata: OAuth, import storico paginato e riprendibile, supporto multi-casella, watch Pub/Sub autenticata, cursor history, poll di fallback e riconciliazione label. Il webhook ora tratta i messaggi Gmail scomparsi come tombstone durevoli e riconosce il cursor history scaduto come condizione non ritentabile, evitando loop Pub/Sub 404→503; il cursor durevole resta invariato finché una sincronizzazione storica ristabilisce il gap. Restano recovery drill completo, alert/SLO e modello storico Sent/response KPI prima di `Production-ready` |
| Email | Outlook | Inbox email | Specifica | Definire Microsoft Graph adapter |
| Email | IMAP/SMTP | Caselle generiche | Specifica | Sicurezza credenziali e limiti provider |
| Messaggistica | WhatsApp | Inbox e automazioni | Tenant reale | Coexistence Business App verificata in produzione sul tenant Villa I Barronci: numero reale collegato, inbound in Inbox e outbound riuscito; webhook Meta configurato con `messages`, `smb_message_echoes`, `smb_app_state_sync` e `history`. Restano monitoraggio, retry drill e runbook prima di `Production-ready` |
| Messaggistica | Telegram | Inbox/ManuBot | Da verificare | Separare bot manutenzioni e canale ospiti |
| Social | Instagram/Facebook | Messaggi | Specifica | API Meta, permessi e review app |
| VoIP | 3CX | Chiamate, attribuzione e assistenti vocali tenant-aware | Codice | CRM/call control presenti; bridge v1 e mappa IVR 4 BID persistente con scope KB e fallback espliciti. CRM e voce usano ora credenziali cifrate e revocabili distinte. Mancano applicazione della migrazione, deploy PBX, configurazione delle basi, prova tenant reale, limite distribuito e osservabilità; vedere `docs/3CX_VOICE_AI.md` |
| OTA | Booking.com | Recensioni, messaggi, risposte, analytics | Specifica | Subordinato a Connectivity/partnership e scope API |
| OTA | Altri portali | Messaggi, recensioni, prezzi | Idea/Specifica | Definire priorità e adapter |
| Pagamenti | Stripe | Pagamenti, abbonamenti, extra | Da verificare | Account model, Connect, webhook owner e PCI scope |
| Fatturazione | Fatture in Cloud | Fatture/contabilità | Da verificare | Inventariare implementazione esistente |
| SDI | OpenAPI Invoice | E-fatture, ricezione/invio, conservazione | Specifica | Verificare codice destinatario, pricing e responsabilità |
| Banking | Fabrick AISP | Conti e movimenti | Valutazione | Verificare costi, consenso, rinnovi e copertura |
| Demand data | Provider voli | Storico/futuro e origine mercati | Specifica | Selezione provider tramite adapter |
| Demand data | Provider treni | Storico/futuro per stazioni | Specifica | Disponibilità e licenze dati |
| Market pricing | Rate shopper/PriceGuard | Competitor e parity | Da verificare | Origine dati, termini e qualità |
| AI | Knowledge sync interno 4BID | Fonti vocali commerciali da documenti Markdown versionati | Codice | Endpoint HMAC, allowlist e recovery dell'indicizzatore presenti; applicare migrazione, impostare segreti GitHub/Vercel, sincronizzare HotelAccelerator e collaudare 3CX. I satelliti richiedono workflow separati, senza accesso DB cross-prodotto |
| AI | Provider da definire | Classificazione, generazione, OCR, forecast | Specifica | Privacy, costi, eval, fallback e data retention |

## WhatsApp Business App Coexistence (4BID)

- Proprietario: HotelAccelerator; il webhook condiviso è l'unico owner degli eventi Meta.
- Configurazione Meta richiesta: nell'app 4BID Live, creare una configurazione **Facebook Login for Business → WhatsApp Embedded Signup** con la variante **WhatsApp Business App onboarding / Coexistence**. `META_CONFIG_ID` deve essere l'ID di questa configurazione, non una configurazione “General”.
- Configurazione Vercel: `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_SYSTEM_USER_TOKEN` e `META_WEBHOOK_VERIFY_TOKEN` devono appartenere alla stessa app Meta. I segreti non vanno mai inseriti nel browser o nel repository.
- Garanzia implementata: il backend rifiuta un completamento non marcato come Business App onboarding o un numero che Meta non conferma attivo nell'app; non chiama `/{phone-number-id}/register`, perché quel percorso è quello Cloud API standard e può disconnettere l'app sul telefono.
- Messaggi: i messaggi ricevuti sono salvati come inbound; quelli scritti dal telefono arrivano come `smb_message_echoes` e sono salvati come outbound. Ogni evento è instradato dal proprio `phone_number_id`; conversazioni e risposte restano fissate al canale originario.
- Recovery: se una scrittura Inbox fallisce, il webhook risponde 5xx per far ritentare Meta. Le inserzioni sono idempotenti sull'ID esterno del messaggio.
- Evidenza produzione 2026-08-27: configurazione webhook completata nell'app Meta 4BID; `messages`, `smb_message_echoes`, `smb_app_state_sync` e `history` sottoscritti. Sul tenant Villa I Barronci un numero reale riceve messaggi in Inbox e invia correttamente. Stato: `Tenant reale`.

## Checklist obbligatoria per ogni integrazione

- owner interno e sistema proprietario;
- tenant scope e autorizzazione;
- ambiente test/produzione;
- secret storage e rotazione;
- rate limit e costi;
- mapping e versione del contratto;
- idempotenza, retry e dead-letter;
- webhook verification;
- metriche, alert e runbook;
- privacy, consenso, retention e termini del provider;
- procedura di disconnessione e fallback.
