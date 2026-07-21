// ... existing code ...

## Guard Rail

### assertNoPmsTables()
\`\`\`typescript
import { assertNoPmsTables } from '@/lib/utils/rms-guard'

// In dev, warn se la query usa tabelle PMS
assertNoPmsTables("SELECT * FROM scidoo_raw_bookings") // WARN!
\`\`\`

### Enforcement
Se un file fuori dai connettori importa o querya tabelle PMS-specifiche, deve loggare warning in dev.

<!-- <CHANGE> Aggiunta sezione guard-no-pms-tables -->
### Build Guard: guard-no-pms-tables.mjs

Lo script `scripts/guard-no-pms-tables.mjs` viene eseguito automaticamente prima di ogni build (`prebuild`).

**Cosa fa:**
- Scansiona ricorsivamente `app/` e `components/`
- Cerca stringhe vietate: `raw_*`, `scidoo_*`, `mews_*`, `cloudbeds_*`, `bookings_full`
- Se trovate, il build **fallisce** con exit code 1

**Se il build fallisce per guard-no-pms-tables:**
1. NON bypassare lo script
2. Sposta la query per usare tabelle `rms_*` canoniche
3. Se serve accesso a raw/PMS, fallo solo in `lib/services/` o `lib/connectors/`

**Esecuzione manuale:**
\`\`\`bash
node scripts/guard-no-pms-tables.mjs
