# Integrazioni e confini fra i prodotti

Servizi esterni usati dal Core e modo in cui il Core comunica con i prodotti
verticali. Regole vincolanti in [`../AGENTS.md`](../AGENTS.md) §5.

## Tre progetti Supabase distinti

Il codice referenzia **tre** progetti Supabase separati. Non è un dettaglio di
configurazione: è il confine fra i prodotti.

| Variabile | Prodotto | Uso dal Core |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **HotelAccelerator** (Core) | proprio: lettura e scrittura |
| `SANTADDEO_SUPABASE_URL` | **Santaddeo** | lettura diretta (deviazione, vedi sotto) |
| `MANUBOT_SUPABASE_URL` | **ManuBot** | via `MANUBOT_BASE_URL` + anon key |

**Conseguenza operativa**: l'identità **non è condivisa**. Un utente del Core non
è automaticamente autenticato su Santaddeo o ManuBot. Configurare l'SMTP o le
regole di autenticazione su un progetto **non ha effetto sugli altri**.

## Accesso a Santaddeo — deviazione consapevole

`lib/santaddeo/client.ts` legge **direttamente** il database di Santaddeo con
service-role, cosa che la regola generale vieta. È uno stato transitorio,
disciplinato da 4 vincoli **oggi tutti rispettati** (verificati, non solo
dichiarati nei commenti):

| Vincolo | Stato |
|---|---|
| `server-only`: la service-role key non raggiunge il browser | rispettato |
| Solo letture | rispettato — zero `insert`/`update`/`delete` |
| Ogni query filtra `hotel_id = properties.santaddeo_hotel_id` | rispettato — unico consumatore: `app/api/admin/revenue/summary/route.ts` |
| Env mancanti → `null` → stato `not_configured` | rispettato — mai errori, mai dati finti |

Il filtro `hotel_id` **non è un'ottimizzazione, è la sicurezza**: il service-role
**bypassa la RLS di Santaddeo**, quindi senza filtro una query leggerebbe i dati
di tutti gli hotel. Chi tocca quel file deve mantenere il vincolo.

**Direzione**: sostituire con API versionate esposte da Santaddeo. Fino ad allora
la deviazione resta contenuta a un solo consumatore.

## Accesso a ManuBot

Via `MANUBOT_BASE_URL` (API) con anon key, quindi **soggetto a RLS** — più
conforme dell'accesso a Santaddeo. `lib/manubot.ts` accetta un override per
struttura (`property.manubot_supabase_url`): esistono istanze ManuBot per
struttura, non una sola.

## Servizi esterni

| Servizio | Ambito | Note |
|---|---|---|
| **Supabase** | database, auth, RLS | vedi sopra |
| **Meta / WhatsApp Cloud API** | canale WhatsApp | 48 file; webhook: `app/api/channels/whatsapp/webhook` |
| **Google** | OAuth, Gmail, Pub/Sub, Business Profile | 15 file |
| **Stripe** | abbonamenti, moduli a pagamento, numeri WhatsApp extra | 16 file; webhook: `app/api/stripe/webhook` |
| **FattureInCloud** | fatturazione | 2 file |
| **Vercel Blob** | file e media | 4 file |
| **SMTP** (per struttura) | casella di posta dell'hotel | `lib/email/` — **non** è l'SMTP di Supabase Auth |

### Due SMTP diversi, da non confondere

- **SMTP delle strutture** (`lib/email/`, `smtp_password` in `channel-secrets`):
  le caselle di posta degli hotel, usate dall'inbox.
- **Custom SMTP di Supabase Auth**: si configura nel pannello Supabase, serve per
  recupero password e conferma registrazione.

Cercare `smtp` nel repo trova il primo e fa concludere, sbagliando, che il
secondo sia già configurato.

## Webhook esposti

| Endpoint | Verifica richiesta |
|---|---|
| `app/api/channels/whatsapp/webhook` | `META_WEBHOOK_VERIFY_TOKEN` |
| `app/api/stripe/webhook` | firma `STRIPE_WEBHOOK_SECRET` |
| `app/api/channels/email/webhook` | — |

Un webhook senza verifica della firma accetta richieste da chiunque: è un
ingresso di scrittura non autenticato.

## Redirect URL di autenticazione

I link email usano `window.location.origin`, quindi il dominio da cui l'utente
apre la pagina finisce nel link. **Ogni dominio usato** — `hotelaccelerator.com`,
`www.hotelaccelerator.com`, anteprime — deve essere nell'allowlist *Redirect URLs*
di Supabase, altrimenti il link viene rifiutato.
