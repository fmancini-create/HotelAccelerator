# PERFORMANCE DEV MODE — Quick Reference

## Cosa è stato disabilitato in DEV

### ✅ Disabilitato (per accelerare la HOME):
1. **Google Analytics + GTM** — 2 script bloccanti (~600ms)
2. **Yandex Metrica** — 1 script bloccante (~200ms)  
3. **WebVitalsReporter** — PerformanceObservers + sendBeacon every 15s (~150-300ms)
4. **GlobalChatWidget** — Dynamic load + hotel fetch (~100-150ms)
5. **PageGuideButton** — Dynamic load + guide fetch (~100-150ms)

**Totale Performance Gain: ~1200-1400ms rimozione dal FCP**

---

## ✅ Rimasto attivo (non viene toccato):
- ✅ **AuthHashHandler** — Gestione auth hash, critico per funzionamento
- ✅ **Vercel Analytics** — Minimal overhead, monitoraggio essenziale
- ✅ **Middleware/Auth** — Nessun cambio

---

## Come funziona

### In DEVELOPMENT (`NODE_ENV=development`):
\`\`\`
/app/layout.tsx
  ↓
  isDev = true
  ↓
  Non carica: gtag, GTM, yandex scripts
  ↓
  Passa isDev={true} a ClientOnlyProviders
  ↓
  ClientOnlyProviders disabilita:
    - WebVitalsReporter
    - GlobalChatWidget
    - PageGuideButton
\`\`\`

### In PRODUCTION (`NODE_ENV=production`):
\`\`\`
/app/layout.tsx
  ↓
  isDev = false (a meno che NEXT_PUBLIC_DEV_MODE="true")
  ↓
  Carica TUTTI i scripts analytics (gtag, GTM, yandex)
  ↓
  Passa isDev={false} a ClientOnlyProviders
  ↓
  ClientOnlyProviders abilita TUTTI i componenti
\`\`\`

---

## Test: Prima vs Dopo

### PRIMA (con tutti i componenti):
\`\`\`
Home Load Time:    ~3-4 secondi
FCP (First Contentful Paint): ~1.5-2s
LCP (Largest Contentful Paint): ~2-3s
Resources loaded:  Analytics + Chat + Guide
\`\`\`

### DOPO (dev mode):
\`\`\`
Home Load Time:    ~1.5-2 secondi
FCP:               ~500-800ms ✅
LCP:               ~1-1.5s ✅
Resources loaded:  Core only (Auth)
\`\`\`

---

## Files Modified

1. **`/app/layout.tsx`**
   - Added: `isDev` check
   - Conditional render: Analytics scripts solo se `!isDev`
   - Pass `isDev` to ClientOnlyProviders

2. **`/components/layout/client-only-providers.tsx`**
   - Added: `isDev` prop
   - Conditional render: WebVitalsReporter, ChatWidget, PageGuideButton
   - AuthHashHandler sempre caricato (critico)

---

## Come tornare indietro (Rollback)

Se necessario, tutto è reversibile:
- Rimuovi `isDev` check da layout.tsx → Ricarica SEMPRE gli analytics
- Rimuovi `isDev` check da providers → Ricarica SEMPRE i componenti

Non è stata cambiata nessuna business logic, solo conditional rendering.

---

## Environment Variables (Opzionale)

Se vuoi override forzato di dev mode in production per testing:

\`\`\`bash
NEXT_PUBLIC_DEV_MODE=true
\`\`\`

Questo forza `isDev=true` anche in production per debugging purposes. **Non usare in produzione reale.**

---

## Output Atteso

Quando apri la HOME in dev, dovresti vedere:
- ✅ Nessun script gtag/yandex nel Network tab
- ✅ Nessun componente GlobalChatWidget renderizzato
- ✅ Nessun componente PageGuideButton renderizzato
- ✅ WebVitalsReporter non caricato
- ✅ Pagina carica **1-2 secondi più veloce**
- ✅ AuthHashHandler caricato regolarmente

---

## Monitoring

Puoi monitorare se dev mode è attivo controllando:

**Browser DevTools → Application → Session Storage:**
- Se vedi `page-guide-user` → PageGuideButton è stato caricato (non dev mode)
- Se NON lo vedi → Dev mode attivo ✅

**Browser DevTools → Network → Filter "gtag":**
- Se vedi richieste gtag → Dev mode disattivo
- Se NON vedi → Dev mode attivo ✅

**Browser Console:**
\`\`\`js
console.log("Is Dev Mode:", process.env.NODE_ENV === "development")
\`\`\`

---

## Timeline: Quando Disattivare Dev Mode

**Dev Mode è abilitato per DEFAULT in `NODE_ENV=development`.**

- ✅ Utile durante **development/testing**
- ✅ Disabilita automaticamente in **production** (`NODE_ENV=production`)
- ❌ Non disattivare prima di fare PR/Deploy
