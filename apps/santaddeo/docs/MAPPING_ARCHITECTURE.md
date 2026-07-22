# ARCHITETTURA MAPPATURE PMS → RMS

## 1. PRINCIPI FONDAMENTALI

### 1.1 Separazione dei Livelli di Mappatura

\`\`\`
┌─────────────────────────────────────────────────────────────────────┐
│                    LIVELLO 1: MAPPATURA PMS (Semantica)             │
│                                                                     │
│  Definisce COME tradurre i dati da un PMS specifico al formato RMS  │
│  - Mapping campi: checkin_date → check_in_date                      │
│  - Mapping valori: "CNF" → "confirmed"                              │
│  - Regole di trasformazione: prezzo * 1.10 (IVA)                    │
│  - UGUALE per TUTTE le strutture che usano quel PMS                 │
│                                                                     │
│  Stato: DRAFT → VALIDATED → LOCKED                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 LIVELLO 2: BINDING HOTEL (Operativo)                │
│                                                                     │
│  Definisce QUALI dati specifici della struttura mappare             │
│  - Tipologie camera: "DUS" → room_type_id=123                       │
│  - Tariffe: "BAR" → rate_plan_id=456                                │
│  - Canali: "BDC" → channel_id=789                                   │
│  - SPECIFICO per ogni singola struttura                             │
│                                                                     │
│  Stato: INCOMPLETE → COMPLETE → ACTIVE                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ETL PIPELINE                                  │
│                                                                     │
│  BLOCCO se:                                                         │
│  - Mappatura PMS non è VALIDATED/LOCKED                             │
│  - Binding Hotel non è COMPLETE/ACTIVE                              │
│  - Entità critiche mancanti                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD / REPORT / KPI                          │
│                                                                     │
│  Usa SOLO dati RMS normalizzati                                     │
│  NON conosce il PMS di origine                                      │
└─────────────────────────────────────────────────────────────────────┘
\`\`\`

---

## 2. STATI DELLE MAPPATURE

### 2.1 Mappatura PMS (Semantica)

| Stato | Descrizione | ETL | Modificabile |
|-------|-------------|-----|--------------|
| **DRAFT** | In lavorazione, non completa | BLOCCATO | Sì |
| **VALIDATED** | Completa e validata, pronta per uso | PERMESSO | Sì (con warning) |
| **LOCKED** | Bloccata in produzione | PERMESSO | No (richiede unlock) |

### 2.2 Binding Hotel (Operativo)

| Stato | Descrizione | Sync | Modificabile |
|-------|-------------|------|--------------|
| **INCOMPLETE** | Mancano binding obbligatori | BLOCCATO | Sì |
| **COMPLETE** | Tutti i binding obbligatori presenti | PERMESSO | Sì |
| **ACTIVE** | In uso attivo, dati sincronizzati | PERMESSO | Sì (con audit) |

---

## 3. DEFINIZIONE DI "MAPPATURA COMPLETA"

### 3.1 Checklist Obbligatoria Mappatura PMS

\`\`\`typescript
interface PmsMappingChecklist {
  // ENTITÀ CRITICHE (tutte obbligatorie)
  criticalEntities: {
    reservation: boolean;      // Prenotazioni
    guest: boolean;            // Ospiti
    room_type: boolean;        // Tipologie camera
    rate: boolean;             // Tariffe
    availability: boolean;     // Disponibilità
  };
  
  // CAMPI OBBLIGATORI PER ENTITÀ
  requiredFields: {
    reservation: [
      'booking_id',
      'check_in_date', 
      'check_out_date',
      'status',
      'total_amount',
      'room_type_id'
    ];
    guest: [
      'first_name',
      'last_name',
      'email'
    ];
    room_type: [
      'room_type_id',
      'room_type_name',
      'base_capacity'
    ];
    rate: [
      'rate_id',
      'rate_name'
    ];
    availability: [
      'date',
      'room_type_id',
      'available_count'
    ];
  };
  
  // VALORI OBBLIGATORI
  requiredValues: {
    booking_status: ['confirmed', 'cancelled', 'pending'];
    document_type: ['identity_card', 'passport'];
  };
}
\`\`\`

### 3.2 Checklist Obbligatoria Binding Hotel

\`\`\`typescript
interface HotelBindingChecklist {
  // Tutte le tipologie camera del PMS devono essere mappate
  roomTypes: {
    allMapped: boolean;
    mappedCount: number;
    totalCount: number;
  };
  
  // Tutte le tariffe attive del PMS devono essere mappate
  ratePlans: {
    allMapped: boolean;
    mappedCount: number;
    totalCount: number;
  };
  
  // Canali principali devono essere mappati
  channels: {
    minimumMapped: boolean;  // almeno 1
    mappedCount: number;
  };
}
\`\`\`

---

## 4. VERSIONING DELLE MAPPATURE

### 4.1 Struttura Versione

\`\`\`typescript
interface MappingVersion {
  id: string;
  pms_provider_id: string;
  version_number: number;        // 1, 2, 3...
  status: 'DRAFT' | 'VALIDATED' | 'LOCKED' | 'DEPRECATED';
  
  // Date di validità
  valid_from: Date;              // Quando entra in vigore
  valid_to: Date | null;         // Null = attualmente valida
  
  // Contenuto
  mappings: MappingRule[];
  checklist_status: ChecklistStatus;
  
  // Audit
  created_by: string;
  created_at: Date;
  validated_by: string | null;
  validated_at: Date | null;
  locked_by: string | null;
  locked_at: Date | null;
  
  // Note
  change_notes: string;
}
\`\`\`

### 4.2 Regole di Versioning

1. **Nuova versione** = copia della precedente + modifiche
2. **Solo una versione VALIDATED/LOCKED** per PMS alla volta
3. **Versioni DEPRECATED** mantenute per storico
4. **Rollback** possibile a versione precedente LOCKED

---

## 5. BLOCCHI E CONTROLLI

### 5.1 Blocco ETL

\`\`\`typescript
interface EtlBlockCheck {
  canRun: boolean;
  blockers: EtlBlocker[];
}

interface EtlBlocker {
  type: 'PMS_MAPPING' | 'HOTEL_BINDING' | 'CRITICAL_ENTITY';
  severity: 'ERROR' | 'WARNING';
  message: string;
  resolution: string;
}

// Esempio blocchi
const blockers = [
  {
    type: 'PMS_MAPPING',
    severity: 'ERROR',
    message: 'Mappatura PMS "Scidoo" in stato DRAFT',
    resolution: 'Completare e validare la mappatura PMS'
  },
  {
    type: 'CRITICAL_ENTITY',
    severity: 'ERROR', 
    message: 'Entità "guest" non mappata',
    resolution: 'Mappare tutti i campi obbligatori per "guest"'
  },
  {
    type: 'HOTEL_BINDING',
    severity: 'WARNING',
    message: '3 tipologie camera non mappate per Hotel "Villa Barronci"',
    resolution: 'Completare il binding delle tipologie camera'
  }
];
\`\`\`

### 5.2 Blocco Dashboard

\`\`\`typescript
interface DashboardBlockCheck {
  canShow: boolean;
  dataCompleteness: number;  // 0-100%
  warnings: DashboardWarning[];
}

// Se dataCompleteness < 80% → mostra warning
// Se canShow = false → mostra placeholder
\`\`\`

---

## 6. FLUSSO OPERATIVO

### 6.1 Setup Nuovo PMS

\`\`\`
1. SuperAdmin aggiunge PMS alla lista
2. SuperAdmin configura credenziali API
3. SuperAdmin crea Mappatura PMS v1 (DRAFT)
4. SuperAdmin mappa entità critiche
5. SuperAdmin mappa campi obbligatori
6. Sistema valida checklist → se OK, può passare a VALIDATED
7. SuperAdmin valida → stato = VALIDATED
8. ETL abilitato per quel PMS
\`\`\`

### 6.2 Setup Nuova Struttura

\`\`\`
1. Admin struttura seleziona PMS (già VALIDATED)
2. Sistema crea Binding Hotel (INCOMPLETE)
3. Sistema importa entità dal PMS (room types, rates, etc.)
4. Admin mappa room types → RMS room types
5. Admin mappa rate plans → RMS rate plans
6. Sistema valida checklist → se OK, stato = COMPLETE
7. Prima sync → stato = ACTIVE
8. Dashboard abilitata
\`\`\`

### 6.3 Modifica Mappatura Esistente

\`\`\`
1. SuperAdmin richiede modifica (LOCKED → richiede unlock)
2. Sistema crea nuova versione (DRAFT) basata su corrente
3. SuperAdmin modifica
4. SuperAdmin valida → VALIDATED
5. Vecchia versione → DEPRECATED
6. Nuova versione → LOCKED (opzionale)
\`\`\`

---

## 7. TABELLE DATABASE

### 7.1 pms_mapping_versions

\`\`\`sql
CREATE TABLE pms_mapping_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pms_provider_id UUID REFERENCES pms_providers(id),
  version_number INTEGER NOT NULL,
  status TEXT CHECK (status IN ('DRAFT', 'VALIDATED', 'LOCKED', 'DEPRECATED')),
  
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  
  checklist_status JSONB DEFAULT '{}',
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  locked_by UUID,
  locked_at TIMESTAMPTZ,
  
  change_notes TEXT,
  
  UNIQUE(pms_provider_id, version_number)
);
\`\`\`

### 7.2 pms_rms_mappings (aggiornata)

\`\`\`sql
ALTER TABLE pms_rms_mappings ADD COLUMN IF NOT EXISTS 
  mapping_version_id UUID REFERENCES pms_mapping_versions(id);

ALTER TABLE pms_rms_mappings ADD COLUMN IF NOT EXISTS
  is_required BOOLEAN DEFAULT false;

ALTER TABLE pms_rms_mappings ADD COLUMN IF NOT EXISTS
  transform_rule JSONB;  -- regole di trasformazione
\`\`\`

### 7.3 hotel_bindings

\`\`\`sql
CREATE TABLE hotel_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id),
  pms_provider_id UUID REFERENCES pms_providers(id),
  
  status TEXT CHECK (status IN ('INCOMPLETE', 'COMPLETE', 'ACTIVE')),
  checklist_status JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  
  UNIQUE(hotel_id, pms_provider_id)
);
\`\`\`

### 7.4 hotel_binding_values

\`\`\`sql
CREATE TABLE hotel_binding_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_binding_id UUID REFERENCES hotel_bindings(id),
  
  entity_type TEXT NOT NULL,  -- room_type, rate_plan, channel
  pms_code TEXT NOT NULL,
  pms_label TEXT,
  rms_entity_id UUID,         -- riferimento all'entità RMS
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(hotel_binding_id, entity_type, pms_code)
);
\`\`\`

---

## 8. INTERFACCIA UTENTE

### 8.1 Dashboard SuperAdmin - Mappature PMS

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│  MAPPATURE PMS                                          [+ Nuovo]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SCIDOO                                    v3 ● LOCKED    │  │
│  │ Completezza: 100%  │  Strutture: 5  │  Ultima sync: 2h   │  │
│  │ [Visualizza] [Nuova Versione] [Sblocca]                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ BEDZZLE                                   v1 ● DRAFT     │  │
│  │ Completezza: 45%   │  Strutture: 0  │  ⚠ Non validato   │  │
│  │ [Modifica] [Valida]                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

### 8.2 Checklist Validazione

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│  CHECKLIST VALIDAZIONE - SCIDOO v3                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ENTITÀ CRITICHE                                                │
│  ✅ Prenotazioni (reservation)     15/15 campi                  │
│  ✅ Ospiti (guest)                 12/12 campi                  │
│  ✅ Tipologie Camera (room_type)   8/8 campi                    │
│  ✅ Tariffe (rate)                 6/6 campi                    │
│  ⚠️ Disponibilità (availability)   4/5 campi                    │
│     └─ Mancante: restriction_type                               │
│                                                                 │
│  VALORI OBBLIGATORI                                             │
│  ✅ Stati prenotazione             12/12 valori                 │
│  ✅ Tipi documento                 5/5 valori                   │
│  ✅ Produzione fiscale             10/10 valori                 │
│                                                                 │
│  STATO: 95% Completo                                            │
│  [Completa Mancanti] [Valida Comunque ⚠️] [Annulla]             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
