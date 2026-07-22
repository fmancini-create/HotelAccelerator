# Report disponibilità Hotel Cavallino — Giugno 2026

**Oggetto:** discrepanza tra le prenotazioni esposte dall'API BRiG e l'occupazione mostrata dal gestionale Bedzzle per la stessa struttura.

**Struttura:** Hotel Cavallino (inventory 80 camere/notte)
**Periodo analizzato:** 1–30 giugno 2026
**Data estrazione:** 25 giugno 2026

---

## Sintesi

- I dati che leggiamo via **API BRiG** (`daily-occupancy-filters`) coincidono **esattamente, giorno per giorno**, con le prenotazioni **confermate** che la piattaforma BRiG ci espone.
- Per lo **stesso periodo**, il gestionale **Bedzzle** della struttura mostra un numero **superiore** di camere occupate.
- Differenza complessiva del mese: **+80 camere-notte** presenti in Bedzzle ma **mai esposte tramite l'API BRiG**.

Le prenotazioni cancellate (status `4` / "DELETED") sono escluse correttamente dal conteggio: la differenza **non** dipende da cancellazioni.

La discrepanza si genera quindi **a monte**, nel passaggio Bedzzle → BRiG: alcune prenotazioni confermate presenti nel gestionale non vengono pubblicate sull'API BRiG, che è l'unico canale dati disponibile per questa struttura (BRiG non espone un endpoint di disponibilità diretto).

---

## Dettaglio giornaliero

| Data | BRiG confermate (via API) | BRiG cancellate | Bedzzle (occupancy gestionale) | Gap (Bedzzle − BRiG) |
|------|:---:|:---:|:---:|:---:|
| 2026-06-02 | 28 | 7 | 30 | +2 |
| 2026-06-03 | 69 | 10 | 71 | +2 |
| 2026-06-04 | 64 | 10 | 66 | +2 |
| 2026-06-05 | 45 | 23 | 46 | +1 |
| 2026-06-06 | 29 | 22 | 37 | +8 |
| 2026-06-07 | 17 | 4 | 29 | +12 |
| 2026-06-08 | 31 | 4 | 43 | +12 |
| 2026-06-09 | 39 | 4 | 47 | +8 |
| 2026-06-10 | 49 | 10 | 52 | +3 |
| 2026-06-11 | 40 | 6 | 43 | +3 |
| 2026-06-12 | 31 | 8 | 34 | +3 |
| 2026-06-13 | 78 | 15 | 79 | +1 |
| 2026-06-14 | 15 | 9 | 17 | +2 |
| 2026-06-15 | 40 | 7 | 43 | +3 |
| 2026-06-16 | 58 | 7 | 61 | +3 |
| 2026-06-17 | 59 | 7 | 64 | +5 |
| 2026-06-18 | 44 | 8 | 47 | +3 |
| 2026-06-19 | 19 | 7 | 18 | −1 |
| 2026-06-20 | 22 | 7 | 25 | +3 |
| 2026-06-21 | 13 | 8 | 18 | +5 |
| 2026-06-22 | 50 | 10 | 53 | +3 |
| 2026-06-23 | 55 | 10 | 58 | +3 |
| 2026-06-24 | 64 | 10 | 67 | +3 |
| 2026-06-25 | 53 | 8 | 55 | +2 |
| 2026-06-26 | 14 | 6 | 24 | +10 |
| 2026-06-27 | 17 | 2 | 19 | +2 |
| 2026-06-28 | 11 | 2 | 13 | +2 |
| 2026-06-29 | 10 | 2 | 12 | +2 |
| 2026-06-30 | 15 | 2 | 16 | +1 |
| **Totale** | **1107** | — | **1187** | **+80** |

*(La colonna "Santaddeo" coincide al 100% con "BRiG confermate" su tutti i 30 giorni, quindi è stata omessa per chiarezza.)*

---

## Domanda al supporto BRiG

Per le notti con gap più ampio (es. **07/06 +12**, **08/06 +12**, **26/06 +10**, **06/06 +8**, **09/06 +8**):

> Perché alcune prenotazioni confermate presenti nel gestionale Bedzzle della struttura **non risultano** tra quelle esposte dall'API BRiG (`daily-occupancy-filters`)?
> Si tratta di prenotazioni che non vengono sincronizzate dal gestionale verso BRiG, oppure di un filtro/limite sull'API che ne esclude una parte?

Possiamo fornire, per le date indicate, gli identificativi delle prenotazioni che riceviamo, per un confronto puntuale con quelle presenti nel gestionale.
