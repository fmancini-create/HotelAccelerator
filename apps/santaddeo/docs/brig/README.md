# BRiG — Integrazione PMS Bridge

## Cos'è BRiG

BRiG è un middleware (bridge) RMS-side che espone **un'unica API** per dialogare contemporaneamente con più PMS e Channel Manager. Per Santaddeo, integrare BRiG significa abilitare in un colpo solo tutti i PMS che oggi non gestiamo nativamente (per ora abbiamo solo Scidoo + gsheets/Bedzzle).

## PMS supportati da BRiG

**Certificati (disponibili da subito)**:
- Bedzzle
- 5stelle*
- Cloudbeds
- Hotel Cube
- Mews
- Octorate
- Opera
- Passepartout
- Slope (solo prenotazioni, niente rates)
- Zak

**In certificazione**: Apaleo

**Prossime integrazioni**: Siteminder, Exesoft

> Conseguenza: integrando BRiG, Santaddeo passa da 2 PMS supportati (Scidoo + Bedzzle via gsheets) a 10+ PMS senza scrivere un connettore per ciascuno.

## Modello commerciale BRiG

- **Piano base**: 12,90 EUR/mese per struttura (polling)
- **Piano avanzato**: 19,90 EUR/mese per struttura (con webhook per ricezione push)

## Cosa offre l'API BRiG (lato RMS)

Quattro endpoint principali, tutti autorizzati con header `x-api-key`:

| Endpoint | Metodo | Scopo | Limiti |
|---|---|---|---|
| `/api/ext/reservations/daily-occupancy-filters` | POST | Lista prenotazioni paginata, con filtri (structureId, periodi, status, channelCode, ...) | **100 req/giorno**, max 100 prenotazioni per richiesta |
| `/api/nol/roomtypes/list?sid=...` | GET | Lista room types | Nessun limite |
| `/api/nol/rateplans/list?sid=...` | GET | Lista rate plans | Nessun limite |
| `/api/nol/rates/update/{sid}` | PUT | Push tariffe giornaliere per room+rateplan | Nessun limite |

> **ATTENZIONE LIMITI**: 100 req/giorno per le prenotazioni significa che per un hotel con molte prenotazioni dobbiamo paginare con cura (max 100 prenotazioni/req → max 10.000 prenotazioni scaricabili al giorno per struttura). Per i sync incrementali è più che sufficiente, per il primo allineamento storico potrebbe servire richiedere un upgrade dei limiti al supporto BRiG.

## Auth (RMS-side)

```http
GET /api/nol/roomtypes/list?sid=66f280ae0396d95e07cccda9
Headers:
  x-api-key: <chiave_assegnata>
  Content-Type: application/json
```

La `x-api-key` è specifica per struttura ed è fornita da BRiG in fase di attivazione.

## Schema dato prenotazione (risposta BRiG)

Campi principali ritornati da `daily-occupancy-filters`:

| Campo | Significato |
|---|---|
| `reservationCode` | Codice univoco (mappa su `pms_booking_id`) |
| `reservationParentCode` | Per prenotazioni di gruppo |
| `amount` | Produzione totale prenotazione |
| `amountDetail` | Produzione giornaliera (formato `7900.00::8900.00::11900.00` — moltiplicato x100, separatore `::`) |
| `dateReceived` | Data ricezione (mappa su `booking_date`) |
| `checkin` / `checkout` | Date soggiorno (formato `YYYYMMDD`) |
| `currency` | Valuta |
| `adults` / `children` | Ospiti |
| `channelCode` | `WEB` (Booking Engine) / `AGE` (Agenzie) / `DIR` (Diretto) / `DIT` (Aziende) / `OTA` (Portali) |
| `roomCode` | Tipologia camera (codice PMS, va mappato su RMS canonico) |
| `quantity` | Numero unità prenotate (consigliato sempre 1) |
| `marketCode` | `IND` (Individuale) / `INDA` (Regular individuals) / `GRP` (Gruppi) |
| `status` | `0` Confermata / `2` No-Show / `4` Cancellata / `9` Opzionale |
| `source` | `0` Booking.com / `1` Expedia / `2` HRS / `3` HotelBeds / `4` BookingEngine / `5` Other |
| `sourceOther` | Specifica sorgente quando `source=5` |

> **Nota status**: il filtro Brig usa codici numerici. Non confondere con i nostri status canonici Scidoo (`saldo`, `check_in`, `check_out`, `confermata_carta`, ecc.). Va creato un mapping Brig → canonico in fase di mapper.

## Mapping concettuale Brig → Santaddeo

| Brig | Santaddeo (`bookings`) | Note |
|---|---|---|
| `reservationCode` | `pms_booking_id` | |
| `dateReceived` | `booking_date` | |
| `checkin` | `check_in_date` | Convertire `YYYYMMDD` → `YYYY-MM-DD` |
| `checkout` | `check_out_date` | |
| `amount` | `total_price` | |
| `amountDetail` (per notte) | derivare `price_per_night` = somma/notti | Va parsato e diviso per 100 |
| `roomCode` | `room_type_id` | Via `pms_rms_mappings` |
| `status=0` | `is_cancelled=false`, status normalizzato | |
| `status=2` | `is_cancelled=false`, status `no_show` | |
| `status=4` | `is_cancelled=true` | |
| `status=9` | `is_cancelled=false`, status `opzione` (escluso da Produzione) | |
| `channelCode` | `channel` (post-mapping) | |
| `source` | `source` | |

## Credenziali di test (NON committare in clear)

Per ambiente di test BRiG, vanno salvate in env del progetto Vercel:

```bash
BRIG_BASE_URL=https://brig-service-dot-brig-400706.ew.r.appspot.com
BRIG_TEST_STRUCTURE_ID=<id_struttura_test>
BRIG_TEST_API_KEY=<api_key_test>
```

I valori reali sono nel chat originale dell'utente e nel file PDF allegato (`API KEY BRIG TEST.pdf`). NON salvare le credenziali in repository.

## Reference esterno

- API reference completa: <https://brig-for-rms-api.readme.io/reference/reservations>
- Documentazione macro: file `API BRIG.pdf` nel chat
