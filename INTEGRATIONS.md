# HotelAccelerator — Integrations Registry

Ultimo aggiornamento: 2026-08-21

## Regola

Questo registro distingue intenzione e prova. `Da verificare` significa che una conversazione ne segnala l'esistenza o l'interesse, ma non è stato completato un audit di codice, credenziali, test e produzione.

| Dominio | Provider/canale | Scopo | Stato | Vincoli/prossima verifica |
|---|---|---|---|---|
| Hosting | Vercel | Deploy applicazioni | Da verificare | Inventariare progetti, ambienti e domini |
| Dati/auth | Supabase | Database, Auth, RLS, storage | Da verificare | Audit progetti, policy, migrazioni e service role |
| Codice | GitHub | Repository e CI | Presente | Definire branch policy, CI e documenti mancanti |
| PMS | Scidoo | Camere, disponibilità, tariffe, produzione, push prezzi | Da verificare | Test mapping, retry, idempotenza e tenant reale |
| Browser remoto | Browserbase | PMS interattivo incorporato e login persistente per tenant | Codice | Marketplace collegato a Vercel; route, Context tenant-aware, Live View e fallback diretto implementati. Applicare migrazione, collaudare login Scidoo su Villa I Barronci e misurare durata/costi prima di `Tenant reale` |
| Email | Gmail | Inbox email | Tenant reale | Villa I Barronci verificata: OAuth, watch Pub/Sub, cursor history, poll di fallback e riconciliazione label. Restano da provare recovery con cursor scaduto, verifica autenticità webhook, alert/SLO e modello storico Sent/response KPI prima di `Production-ready` |
| Email | Outlook | Inbox email | Specifica | Definire Microsoft Graph adapter |
| Email | IMAP/SMTP | Caselle generiche | Specifica | Sicurezza credenziali e limiti provider |
| Messaggistica | WhatsApp | Inbox e automazioni | Da verificare | Provider, template, consenso e webhook |
| Messaggistica | Telegram | Inbox/ManuBot | Da verificare | Separare bot manutenzioni e canale ospiti |
| Social | Instagram/Facebook | Messaggi | Specifica | API Meta, permessi e review app |
| VoIP | 3CX | Chiamate, attribuzione e assistenti vocali tenant-aware | Codice | CRM/call control presenti; bridge vocale v1 e fallback 200 implementati. Mancano deploy PBX, prova tenant reale, limite distribuito e osservabilità; vedere `docs/3CX_VOICE_AI.md` |
| OTA | Booking.com | Recensioni, messaggi, risposte, analytics | Specifica | Subordinato a Connectivity/partnership e scope API |
| OTA | Altri portali | Messaggi, recensioni, prezzi | Idea/Specifica | Definire priorità e adapter |
| Pagamenti | Stripe | Pagamenti, abbonamenti, extra | Da verificare | Account model, Connect, webhook owner e PCI scope |
| Fatturazione | Fatture in Cloud | Fatture/contabilità | Da verificare | Inventariare implementazione esistente |
| SDI | OpenAPI Invoice | E-fatture, ricezione/invio, conservazione | Specifica | Verificare codice destinatario, pricing e responsabilità |
| Banking | Fabrick AISP | Conti e movimenti | Valutazione | Verificare costi, consenso, rinnovi e copertura |
| Demand data | Provider voli | Storico/futuro e origine mercati | Specifica | Selezione provider tramite adapter |
| Demand data | Provider treni | Storico/futuro per stazioni | Specifica | Disponibilità e licenze dati |
| Market pricing | Rate shopper/PriceGuard | Competitor e parity | Da verificare | Origine dati, termini e qualità |
| AI | Provider da definire | Classificazione, generazione, OCR, forecast | Specifica | Privacy, costi, eval, fallback e data retention |

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
