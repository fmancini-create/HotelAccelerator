/**
 * Normalizza un nome/codice camera in uno slug stabile usato come room_types.code.
 * Usato da GSheetsSyncService (ensureRoomTypes + syncBookings) e PMSImportService.
 *
 * trim, collapse multiple spaces, lowercase, replace non-alphanum with '-',
 * collapse '-', strip leading/trailing '-'.
 *
 * "Camera Doppia " -> "camera-doppia"
 * "  Suite    DELUXE  " -> "suite-deluxe"
 * "  " -> ""
 */
export function normalizeRoomTypeCode(input: string): string {
  if (!input) return ""
  return input
    .trim()
    .replace(/\s+/g, " ")       // collapse multiple spaces
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanum -> dash
    .replace(/-+/g, "-")         // collapse dashes
    .replace(/^-|-$/g, "")       // strip leading/trailing
}
