## Obiettivo

Descrivere in modo semplice cosa cambia e perche'.

## Roadmap obbligatoria

Per ogni PR indicare una delle due opzioni:

- `Roadmap-Key: <chiave>` — obbligatorio per nuove funzionalita, moduli, integrazioni, addon o sviluppi dedicati. La riga deve gia' esistere in `/super-admin/roadmap` ed essere `In sviluppo`, `Bloccato` o `Da fare`.
- `Roadmap: N/A — <motivo>` — ammesso solo per puro bugfix, refactor o manutenzione che non avvia/estende una capability di prodotto.

La PR **non deve segnare la capability Online**. Il verde viene applicato solo dopo merge in `main`, CI pertinente verde e deploy produzione verificato.

## Verifiche

- [ ] Scope minimo, nessun refactor estraneo
- [ ] Tenant isolation / autorizzazioni verificate dove applicabile
- [ ] Error/loading/empty state/mobile/accessibilita' verificati dove applicabile
- [ ] Typecheck/test/build pertinenti verdi
- [ ] Migrazioni/configurazioni/rollback documentati
- [ ] Riga roadmap presente e aggiornata allo stato reale

## Chiusura

Dopo il merge e il deploy produzione verificato:

- aggiornare la riga roadmap a `Online`;
- salvare branch/numero PR come evidenza;
- mantenere separato il livello tecnico ufficiale (`Codice`, `Tenant reale`, ecc.).

Se la PR viene chiusa senza merge, aggiornare prima la roadmap a `Abbandonato` o `Bloccato`.
