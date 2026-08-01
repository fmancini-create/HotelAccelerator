# Registro dei moduli

> **File generato.** Non modificarlo a mano: rigeneralo con
> `node --env-file-if-exists=/vercel/share/.env.project scripts/generate-module-registry.mjs`
>
> Ultima generazione: 2026-08-01 · Fonte: tabelle `modules` e `tenant_modules`

## Moduli registrati

| Chiave | Nome | Categoria | is_core | Disponibile | Legacy | Strutture attive |
|---|---|---|---|---|---|---|
| `cms` | CMS | core | sì | sì | sì | **1** |
| `inbox` | Inbox | core | sì | sì | sì | **1** |
| `crm` | CRM | core | sì | sì | no | **1** |
| `ai` | AI | core | no | sì | sì | **1** |
| `tracking` | Tracking & Eventi | core | sì | sì | no | **1** |
| `frontend` | Sito pubblico | core | no | sì | sì | **1** |
| `santaddeo` | Revenue (Santaddeo) | product | no | sì | no | **0** |
| `manubot` | Operations (Manubot) | product | no | sì | no | **0** |
| `hotelprofitai` | HotelProfitAI | product | no | sì | no | **0** |

## Adozione reale

- Strutture in piattaforma: **1**
- Strutture con almeno un modulo attivo: **1**
- Righe di attivazione: **6** (di cui `active`: **6**)

Con **1** struttura attiva la piattaforma è a livello **Tenant reale**, *non* **Multi-tenant** (vedi `AGENTS.md` §1). L'isolamento fra tenant non è quindi dimostrato dall'uso: va verificato per lettura del codice e con prove dedicate.

## Anomalie rilevate

- Registrati ma attivi su **zero** strutture: `santaddeo`, `manubot`, `hotelprofitai`. Sono a livello **Codice**: la presenza in tabella non significa che siano integrati.
- `category = 'core'` ma `is_core = false`: `ai`, `frontend`. Due nozioni diverse di "core" che non coincidono: chi filtra sull'una ottiene un insieme differente dall'altra.

## Nota sul modello dati

Il "tenant" è di fatto la **struttura**: `tenant_modules.property_id` punta a
`properties.id`. Non esiste un livello organizzazione separato. Chi progetta
l'isolamento multi-tenant deve partire da questo vincolo.
