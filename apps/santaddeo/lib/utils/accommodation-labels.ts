/**
 * Accommodation type labels utility.
 * Each hotel has an `accommodation_type` field set during registration.
 * This replaces hardcoded "camere" throughout the platform.
 *
 * Supported types:
 * - camere (default) -> Hotel/B&B
 * - appartamenti      -> Residence, aparthotel
 * - piazzole          -> Camping
 * - bungalow          -> Camping village
 * - unita             -> Generic (mixed)
 */

export const ACCOMMODATION_TYPES = [
  { value: "camere", label: "Camere", plural: "camere", singular: "camera" },
  { value: "appartamenti", label: "Appartamenti", plural: "appartamenti", singular: "appartamento" },
  { value: "piazzole", label: "Piazzole", plural: "piazzole", singular: "piazzola" },
  { value: "bungalow", label: "Bungalow", plural: "bungalow", singular: "bungalow" },
  { value: "chalet", label: "Chalet", plural: "chalet", singular: "chalet" },
  { value: "suite", label: "Suite", plural: "suite", singular: "suite" },
  { value: "ville", label: "Ville", plural: "ville", singular: "villa" },
  { value: "unita", label: "Unita' ricettive", plural: "unita'", singular: "unita'" },
] as const

export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number]["value"]

/** Get the plural label for the accommodation type (e.g. "camere", "appartamenti") */
export function getAccommodationPlural(type?: string | null): string {
  const found = ACCOMMODATION_TYPES.find((t) => t.value === type)
  return found?.plural ?? "camere"
}

/** Get the singular label (e.g. "camera", "appartamento") */
export function getAccommodationSingular(type?: string | null): string {
  const found = ACCOMMODATION_TYPES.find((t) => t.value === type)
  return found?.singular ?? "camera"
}

/** Get the display label (e.g. "Camere", "Appartamenti") */
export function getAccommodationLabel(type?: string | null): string {
  const found = ACCOMMODATION_TYPES.find((t) => t.value === type)
  return found?.label ?? "Camere"
}

/**
 * Replace "camere" in a template string with the correct accommodation type.
 * Example: accommodationReplace("Camere Vendute", "piazzole") -> "Piazzole Vendute"
 */
export function accommodationReplace(text: string, type?: string | null): string {
  const plural = getAccommodationPlural(type)
  const label = getAccommodationLabel(type)
  return text
    .replace(/Camere/g, label)
    .replace(/camere/g, plural)
}
