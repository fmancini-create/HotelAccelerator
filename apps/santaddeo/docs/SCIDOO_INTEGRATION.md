# Integrazione Scidoo

Questa guida spiega come configurare e utilizzare l'integrazione con il PMS Scidoo.

## Configurazione

### 1. Ottenere l'API Key di Scidoo

1. Accedi al tuo account Scidoo
2. Vai nelle impostazioni API
3. Genera una nuova API Key
4. Copia l'API Key (la vedrai solo una volta)

### 2. Configurare l'integrazione in SANTADDEO

1. Vai su **Impostazioni** → **Integrazione PMS**
2. Seleziona **Scidoo** come PMS
3. Incolla la tua API Key
4. Clicca su **Testa Connessione** per verificare
5. Salva la configurazione

### 3. Configurare il Cron Job (Vercel)

Per abilitare la sincronizzazione automatica ogni 15 minuti:

1. Vai su **Vercel Dashboard** → Il tuo progetto → **Settings** → **Environment Variables**
2. Aggiungi una nuova variabile:
   - **Name**: `CRON_SECRET`
   - **Value**: Genera un secret casuale (es: `openssl rand -base64 32`)
3. Il file `vercel.json` è già configurato per eseguire il cron job

## Sincronizzazione

### Sincronizzazione Automatica

Il sistema sincronizza automaticamente i dati ogni 15 minuti:

- **Range temporale**: -30 giorni / +365 giorni dalla data odierna
- **Dati sincronizzati**:
  - Prenotazioni (nuove e modificate)
  - Categorie di alloggio (solo prima sincronizzazione)
  - Disponibilità giornaliera

### Sincronizzazione Manuale

Puoi avviare una sincronizzazione manuale dalla dashboard:

1. Clicca sul pulsante **Sincronizza da Scidoo** nell'header
2. Attendi il completamento (può richiedere alcuni minuti)
3. I dati verranno aggiornati automaticamente

## Sistema Anti-Ridondanza

Per evitare sincronizzazioni ridondanti, il sistema implementa:

1. **Lock di sincronizzazione**: Previene sincronizzazioni concorrenti
2. **Last Modified**: Usa il parametro `last_modified` dell'API Scidoo per sincronizzare solo i dati modificati
3. **Stale Lock Detection**: Resetta automaticamente i lock più vecchi di 30 minuti

## Dati Sincronizzati

### Prenotazioni

Vengono importate tutte le prenotazioni con:
- Dati ospite (nome, email, telefono, paese)
- Date di check-in/check-out
- Categoria di alloggio
- Prezzi (per notte e totale)
- Canale di provenienza
- Stato (confermata, cancellata, ecc.)

### Categorie di Alloggio

Vengono importate le categorie con:
- Nome e descrizione
- Numero totale di camere
- Capacità massima

### Disponibilità

Viene importata la disponibilità giornaliera per ogni categoria:
- Camere totali
- Camere disponibili
- Camere occupate

## Monitoraggio

Puoi monitorare lo stato delle sincronizzazioni:

1. Vai su **Impostazioni** → **Integrazione PMS**
2. Visualizza:
   - Ultima sincronizzazione
   - Stato (successo/errore)
   - Statistiche (prenotazioni sincronizzate, errori, ecc.)

## Troubleshooting

### La sincronizzazione non parte

1. Verifica che l'API Key sia corretta
2. Controlla che l'integrazione sia attiva
3. Verifica i log in Vercel Dashboard

### Errori di sincronizzazione

1. Controlla lo stato nella pagina Impostazioni PMS
2. Verifica che l'API Key non sia scaduta
3. Contatta il supporto Scidoo se l'API non risponde

### Lock bloccato

Se una sincronizzazione rimane bloccata:
- Il sistema resetta automaticamente i lock dopo 30 minuti
- Oppure puoi disattivare e riattivare l'integrazione

## API Endpoints

### POST /api/scidoo/sync

Avvia una sincronizzazione manuale.

**Body:**
\`\`\`json
{
  "hotelId": "uuid",
  "startDate": "2024-01-01",
  "endDate": "2025-01-01"
}
\`\`\`

### GET /api/cron/sync-scidoo

Endpoint per il cron job automatico (protetto da `CRON_SECRET`).

**Headers:**
\`\`\`
Authorization: Bearer {CRON_SECRET}
\`\`\`

## Limiti e Considerazioni

- **Rate Limiting**: Scidoo potrebbe avere limiti di rate, il sistema gestisce automaticamente gli errori
- **Timeout**: Le sincronizzazioni molto grandi potrebbero richiedere tempo
- **Dati storici**: La prima sincronizzazione importa tutti i dati nel range specificato

## Supporto

Per problemi con l'integrazione Scidoo:
- Consulta i log in Vercel Dashboard
- Verifica la documentazione API di Scidoo
- Contatta il supporto SANTADDEO
