# PROFILES SCHEMA - CORREZIONE FINALE

## 1. COLONNE REALI DI `profiles`

Dal database Supabase reale (error logs):
\`\`\`sql
public.profiles
  - id (uuid, PK, FK → auth.users) ✅ EXISTS
  - email (text) ✅ EXISTS
  - role (text) ✅ EXISTS
  - organization_id (uuid, FK → organizations) ✅ EXISTS
  
  - full_name (text) ❌ DOES NOT EXIST
  - hotel_id (uuid) ❌ DOES NOT EXIST
  - avatar_url (text) ❌ UNKNOWN
\`\`\`

## 2. QUERY ERRATA (PRIMA)

\`\`\`typescript
// ❌ SBAGLIATO
const { data: profile } = await adminClient
  .from("profiles")
  .select("role, organization_id, full_name")
  .eq("id", user.id)
  .single()

// Risultato: HTTP 400
// column profiles.full_name does not exist
\`\`\`

## 3. QUERY CORRETTA (DOPO)

\`\`\`typescript
// ✅ CORRETTO - SOLO COLONNE REALI
const { data: profile } = await adminClient
  .from("profiles")
  .select("role, organization_id")
  .eq("id", user.id)
  .single()
\`\`\`

## 4. ENDPOINT `/api/auth/me` - RESPONSE FINALE

\`\`\`json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com"
  },
  "role": "system_admin",
  "organization_id": "org-uuid",
  "is_superadmin": true
}
\`\`\`

**NON include**: `full_name`, `hotel_id`, `avatar_url`

## 5. FILE TOCCATI

- ✅ `/app/api/auth/me/route.ts` - Query corretta, response senza `full_name`
- ✅ `/lib/supabase/server.ts` - Nessuna modifica (getAuthUser è già corretto)

## 6. COME TESTARE

### Test 1: Verificare che `/api/auth/me` ritorni 200 (non 400)

\`\`\`bash
curl -H "Cookie: sb-santaddeo-auth-token=..." \
  https://your-domain.com/api/auth/me

# Expected output (HTTP 200):
{
  "user": {"id": "...", "email": "..."},
  "role": "system_admin",
  "organization_id": "...",
  "is_superadmin": true
}
\`\`\`

### Test 2: Debug logs nel server

Nel v0 preview, dovresti vedere:
\`\`\`
[DEBUG] Sample profile data shape: [list of real columns]
\`\`\`

Questo ti dirà esattamente quali colonne il database ha.

### Test 3: Login flow

1. Login con `/auth/login` 
2. Redirect a `/dashboard`
3. `/dashboard` chiama `/api/auth/me` (dovrebbe ritornare 200, non 400)
4. Mostra il nome dell'utente (da `user.email` se non c'è `full_name`)

## 7. PRINCIPIO CHIAVE

**NON INVENTARE COLONNE**

Se il database reale non ha `full_name`, non la selezionare. Il client può:
- Usare `user.email` se ha bisogno di un nome
- Mostrare "Sistema Admin" genericamente se superadmin
- Chiedere all'utente di compilare il nome in un'altra tabella (separata)

Mai assumere che una colonna esista. **Query SOLO colonne che sappiamo esistono.**
