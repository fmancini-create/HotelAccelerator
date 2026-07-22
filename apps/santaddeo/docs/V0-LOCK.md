# V0-LOCK — Regole NON Negoziabili

Questo file definisce comportamenti OBBLIGATORI per v0 nel progetto SANTADDEO.
**Nessuna eccezione. Nessuna interpretazione creativa.**

---

## REGOLA 1: Separazione Refactor/Bugfix

**VIETATO** fare refactor + bugfix nello stesso commit.

- Se devo fixare un bug → FIX SOLO IL BUG
- Se devo refactorare → SOLO REFACTOR (senza cambiare comportamento)
- MAI mischiare le due cose

**Violazione tipica:** "Ho fixato l'errore e già che c'ero ho migliorato la struttura"

---

## REGOLA 2: Schema Database Intoccabile

**VIETATO** rinominare tabelle/colonne per "far funzionare la UI".

- Il codice si ADATTA allo schema esistente
- Se una colonna si chiama `checkin_date`, il codice usa `checkin_date`
- MAI creare alias, view, o rinominare per comodità del frontend

**Violazione tipica:** "Ho creato una view che rinomina le colonne per semplificare il codice"

---

## REGOLA 3: Script/Migration Protetti

**VIETATO** eliminare migration/script SQL senza richiesta ESPLICITA dell'utente.

- Gli script esistono per un motivo
- Se sembrano obsoleti → CHIEDO prima di eliminare
- Se l'utente non dice "elimina" → NON elimino

**Violazione tipica:** "Ho rimosso 44 script vecchi per pulizia"

---

## REGOLA 4: No Promesse Future

**VIETATO** scrivere "Il prossimo passo sarà…" e poi implementarlo.

- Completo SOLO quello che l'utente ha chiesto
- Se serve altro → LO DICO ma NON lo faccio
- L'utente decide se procedere

**Violazione tipica:** "Il prossimo passo sarà aggiornare tutti i componenti... *procede a farlo*"

---

## REGOLA 5: Output Strutturato Obbligatorio

**OGNI** modifica deve includere:

\`\`\`
## MODIFICA: [titolo breve]

### (a) File toccati:
- `path/to/file.ts` — motivo

### (b) Perché:
[spiegazione in 1-2 righe]

### (c) Come testare in preview:
1. Vai a /path
2. Fai X
3. Verifica Y
\`\`\`

**Violazione tipica:** Scrivere codice senza spiegare cosa testare

---

## CHECKLIST PRE-COMMIT

Prima di ogni modifica, v0 DEVE verificare:

- [ ] Sto facendo UNA sola cosa (fix OPPURE refactor)?
- [ ] Sto modificando lo schema DB? Se sì, l'utente lo ha chiesto?
- [ ] Sto eliminando file? Se sì, l'utente lo ha chiesto?
- [ ] Ho promesso "prossimi passi"? Se sì, mi fermo qui.
- [ ] Ho incluso file toccati + perché + come testare?

---

## CONSEGUENZE

Se v0 viola queste regole:
1. L'utente può citare questo file
2. v0 DEVE fare rollback della modifica non autorizzata
3. v0 DEVE ripartire rispettando le regole

---

*Ultimo aggiornamento: 2025-12-31*
*Versione: 1.0*
