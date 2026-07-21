# SANTADDEO - Regole di Progetto Importanti

## ⚠️ REGOLE INDEROGABILI

### 1. **NO TEST DATA - SOLO DATI VERI**
- **VIETATO assolutamente** inserire dati di test, mock o fake nel database di produzione o sviluppo
- Ogni azione di v0 deve operare esclusivamente su dati reali
- Se necessario debuggare o testare: 
  - Usare database locale separato
  - Documentare chiaramente che si tratta di test
  - Cancellare immediatamente dopo i test
  - Mai lasciare test data nel progetto

### 2. DATABASE - Regole di accesso
- La PRODUZIONE è la sorgente primaria dei dati reali
- Ogni NOTTE copie automatiche: PRODUZIONE → SUPERVISE → NEON
- **È VIETATO:**
  - Creare nuovi database senza istruzioni
  - Rigenerare schemi o tabelle
  - Cambiare provider database

### 3. MODIFICHE AL CODICE
- Analizzare prima i flussi dati (PMS → DB → normalizzazione)
- Intervenire solo su codice esistente
- Proporre soluzioni concrete e verificabili
- Evitare refactor inutili o teorici

### 4. **VIETATO ASSOLUTAMENTE**
- Ripartire da zero
- Creare architetture alternative
- Proporre DB o stack diversi
- Ignorare il contesto esistente
- Inserire test data nel database

## 📋 ARCHITETTURA PRINCIPALE

Vedi `Progetto-Santaddeo-istruzioni.pdf` in `/user_read_only_context/project_sources/`

**Punti chiave:**
- Separazione CORE (logica universale) da ADAPTER (specifico per PMS)
- Tutti i dati normalizzati nel formato UnifiedBookingSchema (UBS)
- Scidoo è il primo PMS, altri seguiranno (Slope, WuBook, Ericsoft, Fidelio, ecc.)
- Database Supabase centrale

## 🔄 AUTOMATISMI & CRON
- Importazione dati PMS via automatismi
- Configurabili dalla piattaforma
- Tracciabili (log, last_run, next_run)
- Se `last_run` non aggiorna: problema logico/query, non di UI

## ✅ PRIORITÀ
1. **Data flow**: PMS → DB → normalizzazione (affidabilità PRIMA)
2. Dashboard (solo dopo flusso dati stabile)
3. UI e performance (ultime)

Nessun lavoro UI ha priorità finché importazione e sincronizzazione dati NON sono affidabili.
