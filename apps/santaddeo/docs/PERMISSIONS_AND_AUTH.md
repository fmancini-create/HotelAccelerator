# Santaddeo - Permissions & Authentication System

## Overview

Il sistema di autenticazione e permessi utilizza **Supabase Auth** con **profili personalizzati** e **cookie per l'impersonazione**.

### Utenti e Ruoli

Ci sono 3 ruoli principali:
- **super_admin**: Accesso completo a tutte le strutture e funzionalità SuperAdmin
- **user**: Utente normale con accesso solo alle proprie strutture
- **developer**: Ruolo speciale (basato su email) per accesso esteso ai debug

### Flussi di Autenticazione

#### 1. Autenticazione Standard (Produzione)

\`\`\`
1. Utente accede via Supabase Auth (/auth/login)
2. Session token salvato automaticamente
3. Ogni request: createClient() legge la session
4. getSettingsData() carica profilo e permessi dal DB
5. Layout/pagine verificano `profile.role`
\`\`\`

#### 2. Autenticazione Dev/Preview (v0 preview)

\`\`\`
1. Ambiente v0 preview (vusercontent.net, v0.dev)
2. isDevAuth() ritorna true
3. createServiceRoleClient() usato
4. Profilo mock (super_admin) fornito per testing UI
\`\`\`

**IMPORTANTE**: In produzione `isDevAuth()` ritorna false - nessun bypass di autenticazione.

### Impersonazione (SuperAdmin Only)

Ci sono DUE tipi di impersonazione:

#### Tipo 1: Impersonazione Hotel
- Cookie: `impersonated_hotel_id`
- Effetto: SuperAdmin vede i dati di un hotel diverso
- SuperAdmin rimane SuperAdmin, cambia solo l'hotel visualizzato
- Usata da: Header hotel selector

\`\`\`
SuperAdmin (F. Mancini) → Seleziona Hotel "Villa I Barronci" 
→ Cookie impersonated_hotel_id = "villa-id"
→ DashboardContent legge cookie e carica dati di Villa I Barronci
→ SuperAdmin rimane super_admin, accesso a tutte le pagine SuperAdmin-only
\`\`\`

#### Tipo 2: Impersonazione Utente
- Cookies: `impersonated_user_id`, `impersonated_user_name`, `impersonated_hotel_id`
- Effetto: SuperAdmin diventa un altro utente (es. Massabò)
- SuperAdmin rimane nella sessione, ma UI mostra dati di Massabò
- Usata da: Users Manager page (/settings/users)

\`\`\`
SuperAdmin (F. Mancini) → Clicca "Impersona Massabò"
→ Cookies impostati con ID di Massabò + primo hotel di Massabò
→ /api/ui/me legge comunque il profilo del SuperAdmin (dalla sessione)
→ SuperAdmin mantiene accesso a pagine SuperAdmin-only
\`\`\`

### API Endpoints Chiave

#### `/api/ui/me` (GET)
Ritorna il profilo dell'utente SESSIONE (sempre il vero utente autenticato).

**Response**:
\`\`\`json
{
  "user": { id, email, ...},
  "profile": { id, role: "super_admin"|"user"|..., organization_id, ...},
  "isSuperAdmin": true|false,
  "isDeveloper": true|false,
  "isImpersonating": false,
  "impersonatedHotelId": null,
  "_isDevPreview": true|false
}
\`\`\`

**Regola**: `isSuperAdmin` è SEMPRE basato sul profilo della SESSIONE, non su chi viene impersonato.

#### `/api/superadmin/impersonate` (POST)
Setta i cookie di impersonazione.

**Body per impersonazione hotel**:
\`\`\`json
{ "hotelId": "uuid" }
\`\`\`

**Body per impersonazione utente**:
\`\`\`json
{ "userId": "uuid" }
\`\`\`

**Response**:
\`\`\`json
{
  "success": true,
  "mode": "hotel" | "user",
  "hotel": { id, name, organization_id },
  "user": { id, name }
}
\`\`\`

#### `/api/superadmin/impersonate` (DELETE)
Rimuove TUTTI i cookie di impersonazione.

### Flusso Complet Page Load

1. **Layout** (`/app/dati/layout.tsx`):
   - Chiama `getSettingsData()`
   - Legge sessione + profilo + cookies di impersonazione
   - Determina `selectedHotel` (dal cookie se impersonando hotel, altrimenti primo hotel)
   - Passa tutto a AppLayout via `initialData`

2. **AppLayout** (`/components/layout/app-layout.tsx`):
   - Riceve `initialData`
   - Crea `HotelContext` con `selectedHotel` e flags di permessi
   - Renderizza DashboardHeader (dinamico, no SSR)
   - Renderizza AiChatPanel (dinamico, no SSR)
   - Renderizza children

3. **DashboardHeader** (`/components/dashboard/dashboard-header.tsx`):
   - Legge `isSuperAdmin`, `isImpersonatingUser` da props
   - Mostra selettore hotel (solo SuperAdmin)
   - Mostra badge "SuperAdmin" (sempre, per tutte le pagine)
   - Mostra badge "Visualizzando come" se impersonando utente

4. **Pages** (es. `/app/accelerator/pricing/page.tsx`):
   - Client component useEffect: `fetch("/api/ui/me")`
   - Verifica `meData.isSuperAdmin`
   - Se false, mostra "Accesso non autorizzato"
   - Se true, carica e renderizza contenuto

### Problemi Identificati e Soluzioni

#### Problema 1: Pulsanti di navigazione non funzionano in v0 preview
- **Causa**: iframe sandboxato non permette `window.location.href` cross-domain
- **Soluzione**: Utilizzare route link Next.js dove possibile, accettare limite v0 per URL changes
- **Status**: Accettato - è un limite dell'ambiente v0 preview

#### Problema 2: Impersonazione hotel rimane quando cambi pagina
- **Causa**: Cookie persiste fino a 24 ore
- **Soluzione**: DELETE endpoint esiste, UI dovrebbe avere pulsante "Esci"
- **Status**: Il badge SuperAdmin nel header funge da trigger per uscire

#### Problema 3: Cambio hotel non aggiorna i dati
- **Causa**: Generalmente cookie non viene persistito correttamente in v0 preview
- **Soluzione**: Reload with `window.location.href = "/dashboard"` dopo set cookie
- **Status**: Implementato, funziona in produzione

### Best Practices

1. **Per controllare permessi in pagine dinamiche**:
   \`\`\`typescript
   const meRes = await fetch("/api/ui/me")
   const meData = await meRes.json()
   if (!meData.isSuperAdmin) {
     // Show unauthorized
   }
   \`\`\`

2. **Per leggere hotel impersonato**:
   \`\`\`typescript
   // Client-side: passa da props via DashboardData
   // Server-side: cookieStore.get("impersonated_hotel_id")?.value
   \`\`\`

3. **Per impersonare un utente**:
   \`\`\`typescript
   await fetch("/api/superadmin/impersonate", {
     method: "POST",
     body: JSON.stringify({ userId: targetUserId })
   })
   \`\`\`

4. **Per uscire dall'impersonazione**:
   \`\`\`typescript
   await fetch("/api/superadmin/impersonate", { method: "DELETE" })
   window.location.href = "/dashboard"
   \`\`\`

### Testing in v0 Preview

In v0 preview il sistema usa un mock user (super_admin) che permette testing di:
- Layout e componenti
- Header con selettori
- Pagine protette (vengono mostrate perché il mock è super_admin)

Per testare blocchi di permessi in produzione reale:
1. Deploy su Vercel
2. Accedi come utente non-super_admin
3. Verifica che pagine SuperAdmin-only mostrino "Accesso non autorizzato"
