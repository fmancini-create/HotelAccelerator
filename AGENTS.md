# AGENTS.md — istruzioni operative per chi lavora su questo repository

Questo file è la **precondizione** richiesta dalle istruzioni di progetto: va letto
prima di modificare codice. Vale per agenti AI e per persone.

Documenti collegati:

- [`README.md`](./README.md) — cos'è il progetto e come si avvia
- [`docs/SUITE_ROADMAP.md`](./docs/SUITE_ROADMAP.md) — **architettura della suite e roadmap** (fonte unica: non duplicarla)
- [`docs/MODULE_REGISTRY.md`](./docs/MODULE_REGISTRY.md) — moduli e loro stato reale (**generato dal DB**)
- [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) — servizi esterni e confini fra i prodotti

---

## 1. Vocabolario obbligatorio degli stati

Non dire mai "funzionante", "pronto" o "completo" senza indicare **il livello** e
**le evidenze** che lo dimostrano. I livelli, in ordine:

`Idea` → `Specifica` → `UI/mock` → `Codice` → `Demo` → `Tenant reale` →
`Multi-tenant` → `Production-ready` → `Vendibile`

**Stato attuale misurato** (vedi `docs/MODULE_REGISTRY.md`): la piattaforma ha
**1 sola struttura** con moduli attivi. È quindi a livello **`Tenant reale`**,
**non `Multi-tenant`**. I moduli `santaddeo`, `manubot` e `hotelprofitai` sono
registrati ma attivi su **zero** strutture.

## 2. Ordine di priorità

Quando due obiettivi sono in conflitto, vince quello più in alto:

1. Sicurezza dei dati
2. Isolamento fra tenant
3. Autorizzazioni
4. Affidabilità
5. Valore per l'utente
6. Semplicità
7. Compatibilità
8. Osservabilità
9. Velocità
10. **Estetica (ultima)**

> Una grafica bella non compensa una funzione simulata.

## 3. Isolamento multi-tenant

Il "tenant" in questo schema è di fatto la **struttura** (`properties.id`,
usato come `tenant_modules.property_id`), non un'organizzazione separata.
Chi progetta l'isolamento deve partire da qui.

L'isolamento va verificato **anche** in: cache, log, embedding/vettori,
esportazioni e file generati — non solo nelle query.

**Nascondere un elemento nell'interfaccia non è autorizzazione.** Ogni
restrizione deve essere applicata **server-side**. Un controllo solo nel
componente React è aggirabile chiamando la route direttamente.

## 4. Serve la tua conferma esplicita

Non procedere senza approvazione umana per:

- azioni distruttive (cancellazioni, troncamenti, reset)
- migrazioni irreversibili
- **modifica di contratti API** (una route consumata da altri prodotti)
- campagne a pagamento o invii massivi di email
- merge su `main` (fa partire il deploy in produzione)

## 5. Confini fra i prodotti

Proprietà dei domini:

| Sistema | Domini di competenza |
|---|---|
| **Core** (questo repo) | identità, tenant, ruoli, inbox, CRM, CMS, AI centrale |
| **Santaddeo** | revenue, prezzi, PMS |
| **HotelProfitAI** | economia e finanza |
| **ManuBot** | lavoro operativo |

**4BID è il brand, non un software.**

Regola: **nessun accesso diretto al database di un altro prodotto**; si comunica
con API versionate, webhook firmati o eventi. Ogni provider esterno va dietro un
**adapter** — Scidoo è il primo connettore, non il modello di riferimento.

**Deviazione attualmente in essere, consapevole e documentata:**
`lib/santaddeo/client.ts` legge **direttamente** il database di Santaddeo con
service-role. È uno stato transitorio disciplinato da 4 vincoli, tutti oggi
rispettati e da mantenere se il file viene toccato:

- `server-only`: la service-role key non deve mai raggiungere il browser
- **solo letture**, nessuna scrittura (verificato: zero `insert`/`update`/`delete`)
- ogni query **deve** filtrare per `hotel_id = properties.santaddeo_hotel_id`,
  perché il service-role **bypassa la RLS di Santaddeo**
- se le variabili mancano, il client ritorna `null` e il chiamante degrada a
  `not_configured`: **mai errori, mai dati finti**

## 6. Onestà tecnica

Regole nate da errori reali su questo progetto:

- **Un commento non dimostra un comportamento.** Se un commento dichiara una
  regola, verifica che il codice la applichi.
- **Un `200` non prova una scrittura.** Controlla il dato salvato.
- **Cap 1.000 righe di Supabase/PostgREST**: ogni `select` che alimenta un
  totale va paginato con `.range()` ordinando su colonna **univoca** (`id`).
  Il troncamento è **silenzioso**: i numeri restano plausibili e sbagliati.
- **Se il campo che misuri è riscritto dal processo che sorvegli, non è un
  indicatore.** Misura l'effetto dichiarato, non un sintomo di pipeline.
- Dichiara sempre cosa **non** hai potuto verificare.

## 7. Comandi

`node_modules/.bin` **non è nel PATH** e `npm run dev` può fallire con
`next: not found`. Invoca il binario direttamente:

```bash
node node_modules/next/dist/bin/next dev --port 3000   # avvio
pnpm test:run                                          # test (vitest)
node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit
```

**Typecheck**: il `tsconfig.json` include anche `apps/`, quindi `tsc` va
**out of memory** con l'heap di default e può stampare *zero errori* pur non
avendo controllato nulla. Serve `--max-old-space-size`. La **baseline attesa è
~2657 errori preesistenti**: valuta il **delta** rispetto a `main`, non il totale.

Per gli script che leggono variabili d'ambiente:

```bash
node --env-file-if-exists=/vercel/share/.env.project scripts/<file>.mjs
```

## 8. Prima di aprire una PR

- perimetro minimo: solo i file necessari
- nessuno script di prova o `console.log` di debug residuo
- delta typecheck pari a zero rispetto a `main`
- verifica **nel browser** ciò che l'utente vede, non solo la compilazione
- dichiara nella descrizione i **limiti** della verifica svolta
