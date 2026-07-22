# CORREZIONE SCHEMA AUTH — DEFINITIVA

## PROBLEMA RISOLTO

❌ **SBAGLIATO**: Aspettarsi `hotel_id` nel profilo utente  
✅ **CORRETTO**: `profiles` contiene IDENTITÀ (`id`, `email`, `full_name`, `role`, `organization_id`), non CONTESTO (`hotel_id`)

---

## SCHEMA DATABASE (VERO)

### `profiles` table
\`\`\`sql
- id (uuid, PK, FK → auth.users)
- organization_id (uuid, FK → organizations)
- email (text)
- full_name (text)
- role (text) -- 'system_admin', 'villa_admin', 'viewer', etc.
- avatar_url (text)
- created_at (timestamptz)
- updated_at (timestamptz)

-- ❌ NO hotel_id ❌
\`\`\`

### `organizations` table
\`\`\`sql
- id (uuid, PK)
- name (text)
- type (text) -- 'hotel', 'chain', 'management'
- settings (jsonb)
- created_at (timestamptz)
- updated_at (timestamptz)
\`\`\`

### `hotels` table
\`\`\`sql
- id (uuid, PK)
- organization_id (uuid, FK → organizations)
- name (text)
- address (text)
- city (text)
- country (text)
- total_rooms (integer)
- settings (jsonb)
- created_at (timestamptz)
- updated_at (timestamptz)
\`\`\`

---

## MODELLO DI ACCESSO

### System Admin
- `role = 'system_admin'` in profiles
- Accesso a **TUTTI gli hotel** di **TUTTE le organizzazioni**
- Non ha `organization_id` (o ha NULL / non rilevante)

### Organization Admin / Villa Admin
- `role = 'villa_admin'` in profiles
- `organization_id = <specific org>`
- Accesso a **TUTTI gli hotel** della sua organizzazione
- Via RLS: `WHERE hotel_id IN (SELECT h.id FROM hotels h WHERE h.organization_id = profiles.organization_id)`

### Viewer / Operator
- `role = 'viewer'` o `'operator'`
- Stesso modello: `organization_id` determina l'accesso
- RLS applica automaticamente i filtri

---

## ENDPOINT `/api/auth/me` — RESPONSE

\`\`\`json
{
  "user": {
    "id": "5de43b7b-e661-4e4e-8177-7943df06470c",
    "email": "f.mancini@4bid.it",
    "full_name": "Franco Mancini"
  },
  "role": "system_admin",
  "organization_id": null,
  "is_superadmin": true
}
\`\`\`

**Campi:**
- `user`: Identità dell'utente (IMMUTABILE)
- `role`: Permesso globale ('system_admin', 'villa_admin', etc.)
- `organization_id`: Organizzazione di appartenenza (NULL per superadmin)
- `is_superadmin`: Flag convenienza per `role === 'system_admin'`

**NO `hotel_id`**: Il contesto hotel è SEPARATO (query params, localStorage, routing)

---

## FLUSSO LOGIN → PRICING PAGE

\`\`\`
1. User fa login → /api/auth/login (server-side)
   ↓
2. /api/auth/me ritorna identity + role + organization_id
   ↓
3. Client-side check:
   - if (!is_superadmin) → mostra "Accesso non autorizzato"
   - else → permette accesso a pricing
   ↓
4. User seleziona hotel:
   - Query param: ?hotel_id=<uuid>
   - O localStorage: selected_hotel_id
   ↓
5. Pricing page carica dati per quel hotel
   - GET /api/accelerator/pricing-grid?hotel_id=<uuid>&...
\`\`\`

---

## FILE TOCCATI

| File | Azione | Dettaglio |
|------|--------|-----------|
| `/app/api/auth/me/route.ts` | ✅ CORRETTO | Rimosso `hotel_id`, aggiunto `is_superadmin` |
| `/app/accelerator/pricing/page.tsx` | ✅ CORRETTO | Usa `is_superadmin` per check, prende `hotel_id` da params/localStorage |
| `/lib/supabase/server.ts` | ✅ OK | `getAuthUser()` funziona correttamente server-side |
| `/app/auth/login/login-client.tsx` | ✅ OK | Login server-side, nessun client Supabase auth |

---

## RIASSUNTO

**Concettualmente:**
- ✅ Auth = IDENTITÀ (chi sei) + PERMESSI (cosa puoi fare)
- ✅ Hotel = CONTESTO (dove stai lavorando adesso)
- ✅ Separati: login non ritorna hotel_id

**Implementazione:**
- ✅ `/api/auth/me` ritorna: user + role + organization_id + is_superadmin
- ✅ Pricing page: prende hotel_id da URL/localStorage, non dal profilo
- ✅ RLS database: applica filtri basati su role + organization_id
