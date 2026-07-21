// PMS Integration Types

import type { PMSName } from "./database"

export interface PMSConfig {
  name: PMSName
  displayName: string
  requiresApiKey: boolean
  requiresApiSecret: boolean
  requiresEndpoint: boolean
  supportsGSheets: boolean
  configFields?: PMSConfigField[]
}

export interface PMSConfigField {
  key: string
  label: string
  type: "text" | "password" | "url" | "number"
  required: boolean
  placeholder?: string
  helpText?: string
}

export interface PMSDataSync {
  hotel_id: string
  sync_date: string
  bookings: PMSBooking[]
  cancellations: PMSCancellation[]
  daily_summary: PMSDailySummary
}

export interface PMSBooking {
  pms_booking_id: string
  booking_date: string
  checkin_date: string
  checkout_date: string
  room_type_code?: string
  num_rooms: number
  total_amount: number
  channel: string
  channel_name?: string
  status: string
}

export interface PMSCancellation {
  pms_booking_id: string
  cancellation_date: string
  checkin_date: string
  lost_revenue: number
  lost_room_nights: number
}

export interface PMSDailySummary {
  date: string
  available_rooms: number
  out_of_service_rooms: number
  occupied_rooms: number
  total_revenue: number
  direct_revenue: number
  intermediated_revenue: number
}

// PMS Configurations
export const PMS_CONFIGS: Record<PMSName, PMSConfig> = {
  ericsoft_suite_3: {
    name: "ericsoft_suite_3",
    displayName: "Ericsoft Hotel Suite 3",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
    configFields: [
      {
        key: "hotel_code",
        label: "Hotel Code",
        type: "text",
        required: true,
        placeholder: "HOTEL001",
      },
    ],
  },
  ericsoft_suite_4: {
    name: "ericsoft_suite_4",
    displayName: "Ericsoft Hotel Suite 4",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
    configFields: [
      {
        key: "hotel_code",
        label: "Hotel Code",
        type: "text",
        required: true,
        placeholder: "HOTEL001",
      },
    ],
  },
  bedzzle: {
    name: "bedzzle",
    displayName: "Bedzzle",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
    configFields: [
      {
        key: "property_id",
        label: "Property ID",
        type: "text",
        required: true,
      },
    ],
  },
  hotel_cinquestelle: {
    name: "hotel_cinquestelle",
    displayName: "Hotel Cinquestelle",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  room_cloud: {
    name: "room_cloud",
    displayName: "RoomCloud",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  clock_software: {
    name: "clock_software",
    displayName: "Clock Software",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  wubook: {
    name: "wubook",
    displayName: "Wubook",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: false,
    supportsGSheets: true,
  },
  hotelappz: {
    name: "hotelappz",
    displayName: "HotelAppz",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  slope: {
    name: "slope",
    displayName: "Slope",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  hoteltime: {
    name: "hoteltime",
    displayName: "HotelTime",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  roomkeys: {
    name: "roomkeys",
    displayName: "RoomKeys",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  passepartout_welcome: {
    name: "passepartout_welcome",
    displayName: "Passepartout Welcome",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  hotel_2000: {
    name: "hotel_2000",
    displayName: "Hotel 2000",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  fidelio_suite8: {
    name: "fidelio_suite8",
    displayName: "Fidelio Suite 8 (MICROS)",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  hotel_2000_evolution: {
    name: "hotel_2000_evolution",
    displayName: "Hotel 2000 Evolution",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  hotelcube_smart: {
    name: "hotelcube_smart",
    displayName: "HotelCube Smart",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  leonardo: {
    name: "leonardo",
    displayName: "Leonardo",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  nuconga: {
    name: "nuconga",
    displayName: "Nuconga",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  cloud_hotel: {
    name: "cloud_hotel",
    displayName: "Cloud Hotel",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  scidoo: {
    name: "scidoo",
    displayName: "Scidoo",
    requiresApiKey: true,
    requiresApiSecret: true,
    requiresEndpoint: true,
    supportsGSheets: true,
  },
  brig: {
    // BRiG: bridge unico verso 10+ PMS. La configurazione richiede solo apiKey
    // (header x-api-key) e structureId (param `sid`). Il campo `endpoint` è
    // configurabile via env BRIG_BASE_URL e non è per-hotel.
    name: "brig",
    displayName: "BRiG (multi-PMS)",
    requiresApiKey: true,
    requiresApiSecret: false,
    requiresEndpoint: false,
    supportsGSheets: false,
    configFields: [
      {
        key: "structure_id",
        label: "Structure ID",
        type: "text",
        required: true,
        placeholder: "66f280ae0396d95e07cccda9",
        helpText: "ID struttura fornito da BRiG (24 caratteri).",
      },
      {
        key: "brig_sub_pms",
        label: "PMS sottostante",
        type: "text",
        required: false,
        placeholder: "bedzzle, mews, octorate, ...",
        helpText: "Opzionale: il PMS reale dietro BRiG (solo per analytics).",
      },
    ],
  },
}
