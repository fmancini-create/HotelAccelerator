import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { isMachineSender, machineSenderLabel, MACHINE_LOCAL_PART_PATTERN } from "@/lib/crm/machine-sender"

/**
 * These addresses are not invented: they were taken from the real contact table
 * before the cleanup. The negatives are actual people who were sitting in the
 * duplicate groups, so a regression that widens the pattern would delete them
 * from the CRM.
 */
const AUTOMATED = [
  "noreply@booking.com",
  "no-reply@amazon.it",
  "notifications@stripe.com",
  "notification@safetyculture.io",
  "newsletter@lanazione.it",
  "nonrispondere@idealista.it",
  "comunicazioni@intesasanpaolo.com",
  "mailer-daemon@googlemail.com",
  "postmaster@joinacademy.cloud",
  "digest@similarweb.com",
  "calendar-notification@google.com",
  "businessprofile-noreply@google.com",
  "google-workspace-alerts-noreply@google.com",
  "alerts@myheritage.com",
]

const HUMANS = [
  "alberto.magliano@creditsafe.it",
  "stefano.capello@entegraps.eu",
  "alessandro.fasoli@unicredit.eu",
  "info@barronci.it",
  "prenotazioni@barronci.it",
  "mario.rossi@gmail.com",
  // Substrings that must NOT trigger: the pattern is token-bounded.
  "digestivo@ristorante.it",
  "alerta.gomez@example.com",
  "automaticomodena@example.com",
]

describe("isMachineSender", () => {
  it.each(AUTOMATED)("riconosce %s come mittente automatico", (email) => {
    expect(isMachineSender(email)).toBe(true)
  })

  it.each(HUMANS)("non tocca %s", (email) => {
    expect(isMachineSender(email)).toBe(false)
  })

  it("non considera macchina un indirizzo malformato o vuoto", () => {
    expect(isMachineSender("")).toBe(false)
    expect(isMachineSender(null)).toBe(false)
    expect(isMachineSender("noreply")).toBe(false)
    expect(isMachineSender("@noreply.com")).toBe(false)
  })

  it("ignora maiuscole e spazi", () => {
    expect(isMachineSender("  NoReply@Booking.com ")).toBe(true)
  })

  it("guarda solo la parte locale, non il dominio", () => {
    // A real person at a company whose domain contains a machine token.
    expect(isMachineSender("giulia.bianchi@newsletter-agency.it")).toBe(false)
  })
})

describe("machineSenderLabel", () => {
  it("preferisce il nome, poi l'indirizzo, poi un'etichetta neutra", () => {
    expect(machineSenderLabel("noreply@booking.com", "Booking.com")).toBe("Booking.com")
    expect(machineSenderLabel("noreply@booking.com", "  ")).toBe("noreply@booking.com")
    expect(machineSenderLabel(null, null)).toBe("Mittente automatico")
  })
})

describe("allineamento con la migrazione SQL", () => {
  /**
   * The historical cleanup runs the same expression inside Postgres. Two hand
   * maintained copies would drift silently, so the file is read and compared
   * character by character.
   */
  it("la migrazione usa esattamente lo stesso pattern del TypeScript", () => {
    const sqlPath = path.join(process.cwd(), "scripts/210_machine_senders_and_contact_dedup.sql")
    const sql = readFileSync(sqlPath, "utf8")
    expect(sql).toContain(MACHINE_LOCAL_PART_PATTERN)
  })
})
