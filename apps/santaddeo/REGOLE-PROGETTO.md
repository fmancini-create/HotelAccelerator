# REGOLE DI PROGETTO SANTADDEO

## REGOLA FONDAMENTALE: NO DATI FINTI

**MAI scrivere dati fittizi, hardcoded o generati casualmente nelle pagine o componenti.**

Ogni valore visualizzato DEVE provenire da:
- Database (Supabase)
- API reali
- Calcoli basati su dati reali

### Cosa è VIETATO:
- `+€12,450` hardcoded come "Revenue Incrementale"
- `+24.5%`, `+18.2%` come performance finte
- `Math.random()` per generare prezzi o KPI
- Qualsiasi numero statico che simula un dato reale

### Cosa fare invece:
- Se i dati non sono disponibili: mostrare "Dati non disponibili" o uno skeleton
- Se i dati sono in caricamento: mostrare uno spinner o stato loading
- Se non ci sono abbastanza dati storici: mostrare "Storico insufficiente"

### Motivazione:
I dati finti ingannano l'utente e creano false aspettative.
Un hotel manager che vede "+24.5%" pensa di aver migliorato quando in realtà non c'è nessun dato.
Questo è inaccettabile per un software professionale di Revenue Management.

---

## REGOLA: AGGIORNAMENTO SITEMAP

**Ogni volta che viene creata una nuova pagina, DEVE essere aggiunta anche alla mappa del sito in `/superadmin/sitemap/page.tsx`.**

### Cosa fare quando si crea una nuova pagina:
1. Creare la pagina in `/app/[percorso]/page.tsx`
2. Aprire `/app/superadmin/sitemap/page.tsx`
3. Aggiungere la nuova pagina nell'array `pages` nella categoria appropriata:
   ```typescript
   { name: "Nome Pagina", path: "/percorso/pagina", description: "Descrizione breve" }
   ```

### Categorie disponibili:
- **Marketing** - Pagine pubbliche (landing, login, register)
- **Auth** - Autenticazione e callback
- **Dashboard** - Pagine principali utente
- **Dati & Analytics** - Analisi dati e report
- **Accelerator** - Funzionalita premium
- **Impostazioni** - Configurazioni utente
- **Onboarding** - Flusso di onboarding
- **Upgrade** - Pagine di upgrade piano
- **Admin** - Pannello amministrazione hotel
- **Superadmin** - Pannello super amministratore

### Motivazione:
Mantenere una mappa completa di tutte le pagine aiuta a:
- Documentare la struttura dell'applicazione
- Facilitare la navigazione per il superadmin
- Evitare pagine "orfane" o dimenticate

---

Regola creata il: 2026-03-03
Richiesta da: Utente

---

Regola sitemap aggiunta il: 2026-03-19
Richiesta da: Utente
