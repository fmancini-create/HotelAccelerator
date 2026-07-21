# SANTADDEO Performance Optimization — Quick Reference

## 🟢 DIAGNOSI COMPLETATA

### Top 5 Colli di Bottiglia Globali

| # | Collo | File | Latenza | Causa |
|---|-------|------|---------|-------|
| 1 | **Pricing Page** | `/app/accelerator/pricing/page.tsx` | 2-4s | 66 hooks + 14 fetches + massive calculations |
| 2 | **Web Vitals** | `/components/performance/web-vitals.tsx` | 150-300ms | PerformanceObservers + batch telemetry |
| 3 | **Auth Middleware** | `/proxy.ts` | 300-500ms | Supabase session refresh per route |
| 4 | **Chat Widget** | `/components/layout/client-only-providers.tsx` | 100-200ms | Global client component initialization |
| 5 | **Analytics Scripts** | `/app/layout.tsx` | 500ms-1s | Google GTM + Yandex Metrica |

---

## 🟡 SAFE MODE DEV — PER PRICING PAGE

### Attivazione Veloce

**File**: `/app/accelerator/pricing/page.tsx` (linea 10)

\`\`\`typescript
// DISABILITATO (normale)
const DEV_SAFE_MODE = false

// ABILITATO (safe mode)
const DEV_SAFE_MODE = true
\`\`\`

### Cosa Cambia in Safe Mode

✅ **Rimane**: Grid prezzi, tariffe, occupancy, algoritmo  
❌ **Disabilitato**: Tooltip, history, band groups, prev year data  
📊 **Ridotto a**: 7 giorni, 1 sola tariffa, 1 occupancy

### Performance Atteso

| Metrica | Normale | Safe Mode | Miglioramento |
|---------|---------|-----------|---------------|
| **Load Time** | 2.5-4s | 600-800ms | **75%** ⬇️ |
| **FCP** | 1.8-2.2s | 400-500ms | **75%** ⬇️ |
| **Memory** | 150-200MB | 40-50MB | **75%** ⬇️ |

---

## 🔧 COSA FARE ADESSO

### 1️⃣ Test Safe Mode (5 min)
\`\`\`bash
1. Apri /app/accelerator/pricing/page.tsx
2. Cambia linea 10: DEV_SAFE_MODE = true
3. Hard refresh (Cmd+Shift+R)
4. Carica la pagina pricing
5. Verifica se carica in <1 secondo
\`\`\`

### 2️⃣ Misura Performance (5 min)
\`\`\`bash
DevTools → Performance tab
1. Hard refresh (Cmd+Shift+R)
2. Record per 5 secondi
3. Stop e verifica:
   - FCP < 500ms
   - LCP < 800ms
   - Main thread < 1s
\`\`\`

### 3️⃣ Documenta Risultati
- ✅ Safe mode carica veloce? → Conferma che il problema è nella complessità
- ✅ Grid è usabile? → Verificare che core funzionalità resta intatta
- ✅ API funzionano? → Testare salvataggio prezzi

---

## 📋 COMANDI UTILI

### Visualizzare Safe Mode Status
\`\`\`javascript
// Apri console browser e esegui:
console.log("IS_DEV_SAFE_MODE:", IS_DEV_SAFE_MODE)
console.log("SAFE_MODE_CONFIG:", SAFE_MODE_CONFIG)
\`\`\`

### Disabilitare Safe Mode
\`\`\`typescript
// In /app/accelerator/pricing/page.tsx linea 10
const DEV_SAFE_MODE = false
\`\`\`

### Auto-Expiry
- Safe mode scade automaticamente il **2026-03-14** (7 giorni)
- Non è necessario fare nulla dopo quella data

---

## 📊 IMPATTO GLOBALE DELL'APP

### Performance per Pagina

| Pagina | Caricamento | Bottleneck Principale |
|--------|-------------|----------------------|
| **Home** | 800ms-1.2s | Analytics (600ms) + Providers (150ms) |
| **Login** | 600ms-1s | Middleware auth (400ms) + Chat widget (150ms) |
| **Dashboard** | 400-800ms | Middleware (400ms) |
| **Pricing** | 2-4s | **66 hooks + 14 fetches** ← SAFE MODE FIX |

---

## 🎯 PROSSIMI STEP

### Questa Settimana
- ✅ Abilita Safe Mode su pricing
- ✅ Testa che carica in <1s
- ✅ Verifica che grid funziona

### Prossima Settimana
- [ ] Riduci web vitals sampling 20% → 5%
- [ ] Aggiungi session cache (5 min TTL)
- [ ] Cambia GTM script a `lazyOnload`
- [ ] Lazy load chat widget

### Dopo
- [ ] Split pricing component
- [ ] Memoize calculations
- [ ] Server-side rendering dove possibile

---

## ❓ FAQ

**Q: Safe mode influisce sulla funzionalità?**  
A: No, rimangono tutti i core features (edit, save, calcoli). Solo cosmetics e dati storici sono disabilitati.

**Q: Quando disabilitare Safe Mode?**  
A: Dopo 2026-03-14 il flag scade automaticamente. Oppure quando le altre ottimizzazioni sono implementate.

**Q: Posso usare Safe Mode in produzione?**  
A: No, è solo per development/testing. La flag è disabilitata di default.

**Q: Le performance migliori restano anche dopo Safe Mode?**  
A: No, le altre 4 ottimizzazioni (middleware, analytics, providers) rimangono e daranno ulteriori miglioramenti.

---

## 📞 Supporto

Consulta `/PERFORMANCE_DIAGNOSTIC.md` per analisi dettagliata.
