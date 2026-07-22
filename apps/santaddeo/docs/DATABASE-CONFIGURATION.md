# Configurazione Database - DEV/PROD Separation

## 🔴 IMPORTANTE - LEGGERE PRIMA DI SVILUPPARE

A partire da marzo 2026, il progetto SANTADDEO usa **DUE DATABASE SEPARATI** per proteggere i dati di produzione.

---

## 📊 Struttura Database

### PRODUZIONE (aeynirkfixurikshxfov)
- **Url**: `aeynirkfixurikshxfov.supabase.co`
- **Quando usato**: Solo in deploy Vercel in produzione
- **Dati**: Reali, clienti effettivi
- **Accesso**: Via variabili `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Chi può modificare**: Solo deploy Vercel in produzione

### SVILUPPO/PREVIEW (dshdmkmhhbjractpvojp)
- **Url**: `dshdmkmhhbjractpvojp.supabase.co`
- **Quando usato**: v0, preview deployments, sviluppo locale
- **Dati**: Copia di PROD (aggiornata ogni notte alle 3:00)
- **Accesso**: Via variabili `DEV_SUPABASE_URL`, `DEV_SUPABASE_SERVICE_ROLE_KEY`
- **Chi può modificare**: Developer durante sviluppo (i test non impattano PROD)

---

## 🔄 Sincronizzazione Automatica

**Ogni notte alle 3:00 UTC:**
- Endpoint: `/api/cron/sync-databases`
- Azione: Copia completa da PROD → DEV
- Tabelle copiate: 60+ tabelle principali
- Sicurezza: Non cancella in DEV se PROD e DEV sono uguali (fail-safe)

---

## 📝 Come Funziona Automaticamente

### Nel Codice
Il codice **distingue automaticamente** l'ambiente usando:

**Server-side** (`lib/supabase/server.ts`):
```typescript
if (process.env.VERCEL_ENV === 'production') {
  // Usa PROD database
} else {
  // Usa DEV database
}
```

**Browser** (`lib/supabase/browser-client.ts`):
- v0.app, v0.dev, vusercontent.net → DEV database
- Vercel preview → DEV database  
- Produzione Vercel → PROD database

**Non devi fare nulla**, il sistema lo fa automaticamente!

---

## ✅ Checklist Developer

- [x] Capisco che v0/preview usa DEV database
- [x] I miei test non modificano dati di PROD
- [x] Ogni notte DEV è sincronizzato con PROD
- [x] Non devo preoccuparmi di rovinare i dati clienti durante sviluppo

---

## 🚨 Cosa NON Fare

❌ **NON** modificare il database hardcoded nel codice  
❌ **NON** usare `aeynirkfixurikshxfov` direttamente in sviluppo  
❌ **NON** cancellare dati da PROD via v0  
❌ **NON** disabilitare il cron job di sync

---

## 📞 Problemi?

Se il DEV database è fuori sync da PROD:
1. Triggera manualmente `/api/cron/sync-databases` con `CRON_SECRET`
2. Oppure aspetta le 3:00 stanotte
3. Contatta il team

---

## 📅 Data implementazione
**15 Marzo 2026** - Separazione DEV/PROD attivata
