# Santaddeo Platform API v1 - Documentazione

**Versione:** 1.0  
**Base URL:** `https://app.santaddeo.com/api/v1`  
**Autenticazione:** Bearer Token (API Key)

---

## Autenticazione

Ogni richiesta deve includere un header `Authorization`:

\`\`\`bash
Authorization: Bearer sk_live_xxxxxxxxxxxxxxxxxxxx
\`\`\`

**Alternative supportate:**
- Header: `X-API-Key: sk_live_xxxx`
- Query parameter: `?api_key=sk_live_xxxx`

**Gestione token:**
- I token iniziano con `sk_live_` per production
- Sono hashati SHA-256 nel database
- Hanno scopes specifici e hotel_ids accessibili
- Possono avere expiration date e IP allowlist

**Codici errore autenticazione:**
- `401 Unauthorized` - Token mancante o invalido
- `403 Forbidden` - Token disabilitato, scaduto, o IP non autorizzato
- `403 Forbidden` - Scope insufficiente per l'operazione

---

## Rate Limiting

- Limite: configurable per API key (default 60 requests/minute)
- Tracking: last_used_at aggiornato ad ogni richiesta
- Response 429: `Retry-After` header con secondi da attendere

---

## Formato Risposte

### Successo (2xx)

\`\`\`json
{
  "data": { /* contenuto */ }
}
\`\`\`

### Lista con paginazione (2xx)

\`\`\`json
{
  "data": [ /* array */ ],
  "meta": {
    "total": 1250,
    "page": 1,
    "per_page": 50,
    "has_more": true
  }
}
\`\`\`

### Errore (4xx, 5xx)

\`\`\`json
{
  "error": {
    "code": "invalid_request",
    "message": "Descrizione errore"
  }
}
\`\`\`

**Codici errore comuni:**
- `auth_error` - Autenticazione fallita
- `access_denied` - Hotel non accessibile
- `bad_request` - Parametri invalidi
- `internal_error` - Errore server
- `rate_limited` - Limite richieste superato

---

## Endpoint: Production (Dati Produzione Aggregati)

**GET** `/api/v1/hotels/{hotelId}/production`

Dati di produzione giornaliera aggregati (revenue, ADR, RevPAR, occupancy).

**Scope richiesto:** `production:read`

### Query Parameters

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `from` | YYYY-MM-DD | 1° giorno mese corrente | Data inizio (check-in ≥ from) |
| `to` | YYYY-MM-DD | Oggi | Data fine (check-in ≤ to) |
| `page` | integer | 1 | Numero pagina |
| `per_page` | integer | 50 | Record per pagina (max 100) |

### Esempio Richiesta

\`\`\`bash
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/production?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx"
\`\`\`

### Risposta Esempio

\`\`\`json
{
  "data": [
    {
      "date": "2025-01-01",
      "total_revenue": 12450.50,
      "rooms_occupied": 45,
      "total_rooms": 80,
      "adr": 276.68,
      "revpar": 155.63,
      "occupancy_rate": 56.25,
      "source": "pms"
    },
    {
      "date": "2025-01-02",
      "total_revenue": 14200.00,
      "rooms_occupied": 52,
      "total_rooms": 80,
      "adr": 273.08,
      "revpar": 177.50,
      "occupancy_rate": 65.00,
      "source": "pms"
    }
  ],
  "meta": {
    "total": 31,
    "page": 1,
    "per_page": 50,
    "has_more": false
  }
}
\`\`\`

### Descrizione Campi

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `date` | string (YYYY-MM-DD) | Data del dato |
| `total_revenue` | number | Revenue totale in €, incluso Room + ancillary |
| `rooms_occupied` | integer | Numero camere vendute |
| `total_rooms` | integer | Numero totale camere disponibili |
| `adr` | number | Average Daily Rate (revenue/rooms_occupied) |
| `revpar` | number | Revenue Per Available Room (revenue/total_rooms) |
| `occupancy_rate` | number | Percentuale occupazione (rooms_occupied/total_rooms * 100) |
| `source` | string | Sorgente dato: "pms" (sistema prenotazioni) o "manual" |

---

## Endpoint: Canali di Vendita (Channel Mix)

**GET** `/api/v1/hotels/{hotelId}/channels`

Breakdown prenotazioni e revenue per canale di vendita.

**Scope richiesto:** `channels:read`

### Query Parameters

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `from` | YYYY-MM-DD | 1° gennaio anno corrente | Data inizio check-in |
| `to` | YYYY-MM-DD | Oggi | Data fine check-in |

### Esempio Richiesta

\`\`\`bash
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/channels?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx"
\`\`\`

### Risposta Esempio

\`\`\`json
{
  "data": {
    "period": {
      "from": "2025-01-01",
      "to": "2025-01-31"
    },
    "summary": {
      "total_revenue": 385402.50,
      "total_bookings": 156,
      "channels_count": 5
    },
    "channels": [
      {
        "channel": "Booking.com",
        "bookings_total": 58,
        "bookings_active": 56,
        "bookings_cancelled": 2,
        "revenue": 175200.50,
        "room_nights": 285,
        "adr": 614.74,
        "revenue_share": 45.41,
        "cancellation_rate": 3.45
      },
      {
        "channel": "Direct",
        "bookings_total": 45,
        "bookings_active": 44,
        "bookings_cancelled": 1,
        "revenue": 145300.00,
        "room_nights": 215,
        "adr": 675.35,
        "revenue_share": 37.71,
        "cancellation_rate": 2.22
      },
      {
        "channel": "Expedia",
        "bookings_total": 32,
        "bookings_active": 31,
        "bookings_cancelled": 1,
        "revenue": 42800.00,
        "room_nights": 98,
        "adr": 436.73,
        "revenue_share": 11.11,
        "cancellation_rate": 3.13
      },
      {
        "channel": "Airbnb",
        "bookings_total": 15,
        "bookings_active": 14,
        "bookings_cancelled": 1,
        "revenue": 18102.00,
        "room_nights": 42,
        "adr": 430.99,
        "revenue_share": 4.70,
        "cancellation_rate": 6.67
      },
      {
        "channel": "Altro",
        "bookings_total": 6,
        "bookings_active": 6,
        "bookings_cancelled": 0,
        "revenue": 4000.00,
        "room_nights": 18,
        "adr": 222.22,
        "revenue_share": 1.04,
        "cancellation_rate": 0.00
      }
    ]
  }
}
\`\`\`

### Descrizione Campi

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `channel` | string | Nome canale di vendita (Booking.com, Direct, Expedia, etc.) |
| `bookings_total` | integer | Numero totale prenotazioni ricevute |
| `bookings_active` | integer | Prenotazioni attive (non cancellate) |
| `bookings_cancelled` | integer | Prenotazioni cancellate |
| `revenue` | number | Revenue totale in € da questo canale |
| `room_nights` | integer | Total room nights (prenotazioni attive) |
| `adr` | number | Average Daily Rate per room night |
| `revenue_share` | number | % di revenue su totale |
| `cancellation_rate` | number | % cancellazioni su totale prenotazioni |

---

## Endpoint: Reparti/Segmenti (Departments)

**GET** `/api/v1/hotels/{hotelId}/departments`

Revenue aggregato per reparto/segmento (Room, F&B, Spa, Wellness, Bar, Parking, etc.).

**Scope richiesto:** `departments:read`

### Query Parameters

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `from` | YYYY-MM-DD | 1° gennaio anno corrente | Data inizio |
| `to` | YYYY-MM-DD | Oggi | Data fine |

### Esempio Richiesta

\`\`\`bash
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/departments?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx"
\`\`\`

### Risposta Esempio

\`\`\`json
{
  "data": {
    "period": {
      "from": "2025-01-01",
      "to": "2025-01-31",
      "days": 31
    },
    "summary": {
      "total_revenue": 528750.25,
      "departments_count": 6
    },
    "departments": [
      {
        "department": "Room",
        "revenue": 385402.50,
        "quantity": 562,
        "avg_per_day": 12432.34,
        "revenue_share": 72.89
      },
      {
        "department": "F&B",
        "revenue": 98540.75,
        "quantity": 1245,
        "avg_per_day": 3177.44,
        "revenue_share": 18.63
      },
      {
        "department": "Spa",
        "revenue": 28450.00,
        "quantity": 156,
        "avg_per_day": 917.10,
        "revenue_share": 5.38
      },
      {
        "department": "Parking",
        "revenue": 12500.00,
        "quantity": 450,
        "avg_per_day": 403.23,
        "revenue_share": 2.36
      },
      {
        "department": "Wellness",
        "revenue": 2500.00,
        "quantity": 35,
        "avg_per_day": 80.65,
        "revenue_share": 0.47
      },
      {
        "department": "Bar",
        "revenue": 1357.00,
        "quantity": 245,
        "avg_per_day": 43.77,
        "revenue_share": 0.26
      }
    ]
  }
}
\`\`\`

### Descrizione Campi

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `department` | string | Nome reparto (Room, F&B, Spa, etc.) |
| `revenue` | number | Revenue totale in € dal reparto nel periodo |
| `quantity` | integer | Numero transazioni/articoli venduti |
| `avg_per_day` | number | Media revenue giornaliera |
| `revenue_share` | number | % di revenue su totale hotel |

---

## Endpoint: Prenotazioni

**GET** `/api/v1/hotels/{hotelId}/bookings`

Lista prenotazioni con filtri e paginazione.

**Scope richiesto:** `bookings:read`

### Query Parameters

| Parametro | Tipo | Default | Descrizione |
|-----------|------|---------|-------------|
| `from` | YYYY-MM-DD | - | Check-in ≥ from |
| `to` | YYYY-MM-DD | - | Check-in ≤ to |
| `status` | string | all | Filtro: `active`, `cancelled`, `all` |
| `channel` | string | - | Filtro per canale (es. "Booking.com") |
| `page` | integer | 1 | Numero pagina |
| `per_page` | integer | 50 | Record per pagina (max 100) |

### Esempio Richiesta

\`\`\`bash
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/bookings?from=2025-01-01&to=2025-01-31&status=active&page=1&per_page=20" \
  -H "Authorization: Bearer sk_live_xxxx"
\`\`\`

### Risposta Esempio

\`\`\`json
{
  "data": [
    {
      "id": "bk_001",
      "pms_booking_id": "PMS-2025-001",
      "pms_reservation_number": "RES-001",
      "guest_name": "Mario Rossi",
      "channel": "Booking.com",
      "source": "api",
      "check_in_date": "2025-01-15",
      "check_out_date": "2025-01-18",
      "number_of_nights": 3,
      "total_price": 825.50,
      "is_cancelled": false,
      "cancellation_date": null,
      "booking_date": "2024-12-20",
      "created_at": "2024-12-20T14:32:00Z"
    }
  ],
  "meta": {
    "total": 156,
    "page": 1,
    "per_page": 20,
    "has_more": true
  }
}
\`\`\`

### Descrizione Campi

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `id` | string | ID univoco prenotazione in Santaddeo |
| `pms_booking_id` | string | ID della prenotazione nel PMS |
| `pms_reservation_number` | string | Numero conferma prenotazione |
| `guest_name` | string | Nome ospite |
| `channel` | string | Canale di vendita |
| `source` | string | Sorgente dato: "api", "pms", "manual" |
| `check_in_date` | string (YYYY-MM-DD) | Data check-in |
| `check_out_date` | string (YYYY-MM-DD) | Data check-out |
| `number_of_nights` | integer | Numero notti |
| `total_price` | number | Prezzo totale in € |
| `is_cancelled` | boolean | Se cancellata |
| `cancellation_date` | string (YYYY-MM-DDThh:mm:ssZ) | Data cancellazione (se annullata) |
| `booking_date` | string (YYYY-MM-DD) | Data prenotazione |
| `created_at` | string (ISO 8601) | Timestamp creazione record |

---

## Dati Storici

- **Production data:** Dal giorno 1° di attivazione dell'hotel fino ad oggi
- **Bookings data:** Tutte le prenotazioni storiche dal 1° gennaio dell'anno corrente
- **Channels:** Aggregato automaticamente dalle prenotazioni storiche
- **Departments:** Se disponibile tabella `revenue_by_department`, altrimenti Room revenue da daily_production

---

## Limiti e Considerazioni

1. **Paginazione massima:** 100 record per pagina
2. **Rate limit:** Dipende dall'API key (default 60 req/min)
3. **Timeout:** 30 secondi per richiesta
4. **Cache:** No-cache per tutte le risposte
5. **Dati real-time:** Aggiornati ogni 15-30 minuti da PMS
6. **Storico:** Almeno 2 anni di dati disponibili

---

## Esempi di Integrazione

### JavaScript/Node.js

\`\`\`javascript
const API_KEY = "sk_live_xxxxxxxxxxxx";
const HOTEL_ID = "550e8400-e29b-41d4-a716-446655440000";

async function getProduction(from, to) {
  const response = await fetch(
    `https://app.santaddeo.com/api/v1/hotels/${HOTEL_ID}/production?from=${from}&to=${to}`,
    {
      headers: { Authorization: `Bearer ${API_KEY}` }
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error: ${error.error.code} - ${error.error.message}`);
  }
  
  return response.json();
}

// Uso
getProduction("2025-01-01", "2025-01-31").then(result => {
  console.log("Production data:", result.data);
  console.log("Meta:", result.meta);
});
\`\`\`

### Python

\`\`\`python
import requests
from datetime import datetime, timedelta

API_KEY = "sk_live_xxxxxxxxxxxx"
HOTEL_ID = "550e8400-e29b-41d4-a716-446655440000"
BASE_URL = "https://app.santaddeo.com/api/v1"

headers = {"Authorization": f"Bearer {API_KEY}"}

# Production data
response = requests.get(
    f"{BASE_URL}/hotels/{HOTEL_ID}/production",
    params={"from": "2025-01-01", "to": "2025-01-31"},
    headers=headers
)

if response.status_code == 200:
    data = response.json()
    for row in data["data"]:
        print(f"{row['date']}: €{row['total_revenue']}, Occ: {row['occupancy_rate']}%")
else:
    error = response.json()
    print(f"Error: {error['error']['message']}")
\`\`\`

### cURL

\`\`\`bash
# Production data
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/production?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx" \
  -H "Accept: application/json"

# Channels
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/channels?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx"

# Departments
curl -X GET "https://app.santaddeo.com/api/v1/hotels/550e8400-e29b-41d4-a716-446655440000/departments?from=2025-01-01&to=2025-01-31" \
  -H "Authorization: Bearer sk_live_xxxx"
\`\`\`

---

## Support

Per problemi tecnici o richieste:
- Email: tech@santaddeo.com
- Docs: https://docs.santaddeo.com/api
- Status: https://status.santaddeo.com
