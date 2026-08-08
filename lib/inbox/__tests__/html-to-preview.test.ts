import { describe, it, expect } from "vitest"
import { htmlToPreview } from "../html-to-preview"

describe("htmlToPreview", () => {
  it("removes the exact markup that leaked into the list", () => {
    // Copied from a real stored Vercel notification: this is what every row
    // showed after the preview field was switched on.
    const body =
      '<html style="color-scheme:light dark"><head><style type="text/css" rel="stylesheet" media="all">\r\n' +
      ".block-row.block-row--button_set-v1 .block-button {\r\n  display: inline-block;\r\n}\r\n" +
      "</style></head><body><p>Hello, Filippo. Your recent preview deployment is ready.</p></body></html>"

    const preview = htmlToPreview(body)

    expect(preview).toBe("Hello, Filippo. Your recent preview deployment is ready.")
    expect(preview).not.toContain("<")
    expect(preview).not.toContain("color-scheme")
    expect(preview).not.toContain("display")
  })

  it("drops CSS text, which stripping tags alone leaves behind", () => {
    // The trap: removing <style> and </style> as tags keeps everything between
    // them as visible text. The element has to be removed whole.
    const body = "<style>.a { color: red; }</style><p>Testo vero</p>"
    expect(htmlToPreview(body)).toBe("Testo vero")
  })

  it("handles a truncated body with an unclosed style block", () => {
    const body = "<p>Prima</p><style>.a { color: red"
    expect(htmlToPreview(body)).toBe("Prima")
  })

  it("keeps words apart across block-level tags", () => {
    expect(htmlToPreview("<p>Prima</p><p>Seconda</p>")).toBe("Prima Seconda")
    expect(htmlToPreview("Riga uno<br>Riga due")).toBe("Riga uno Riga due")
    expect(htmlToPreview("<td>A</td><td>B</td>")).toBe("A B")
  })

  it("decodes the entities that actually show up in this mailbox", () => {
    expect(htmlToPreview("Prezzo &euro;120 &amp; colazione")).toBe("Prezzo €120 & colazione")
    expect(htmlToPreview("perch&eacute; s&igrave;")).toBe("perché sì")
    expect(htmlToPreview("a&nbsp;b")).toBe("a b")
    expect(htmlToPreview("&#8364;50")).toBe("€50")
    expect(htmlToPreview("&#x20AC;50")).toBe("€50")
  })

  it("leaves an unknown entity alone instead of mangling it", () => {
    expect(htmlToPreview("&notarealentity; testo")).toBe("&notarealentity; testo")
  })

  it("strips Amazon's combining-joiner padding, found only by printing a real row", () => {
    // Verbatim shape of a real stored Amazon body. Each U+034F is followed by
    // a real space, so collapsing whitespace does not merge them and the row
    // read `Ordinato: "..." ͏ ͏ ͏ ͏ ͏ ͏ ͏`. Counting residual tags reported zero
    // problems; the defect was visible only in the printed output.
    const body = '<p>Ordinato: “Mastro Lindo Gomma Magica,...”' + "\u034F ".repeat(120) + "</p>"
    expect(htmlToPreview(body)).toBe("Ordinato: “Mastro Lindo Gomma Magica,...”")
  })

  it("strips the zero-width padding used in email preheaders", () => {
    // Real preheaders pad with hundreds of these; without stripping they eat
    // the whole character budget and the row looks blank.
    const body = "<p>Conferma prenotazione" + "\u200B\u200C\uFEFF".repeat(80) + "</p>"
    expect(htmlToPreview(body)).toBe("Conferma prenotazione")
  })

  it("returns empty string when nothing readable remains, so no stray dash", () => {
    expect(htmlToPreview("<style>.a{color:red}</style>")).toBe("")
    expect(htmlToPreview("<html><head><title>x</title></head><body></body></html>")).toBe("")
    expect(htmlToPreview("   ")).toBe("")
    expect(htmlToPreview(null)).toBe("")
    expect(htmlToPreview(undefined)).toBe("")
    expect(htmlToPreview("")).toBe("")
  })

  it("caps the length so one row cannot flood the list", () => {
    const body = "<p>" + "parola ".repeat(500) + "</p>"
    const preview = htmlToPreview(body)
    expect(preview.length).toBeLessThanOrEqual(200)
    expect(preview.startsWith("parola parola")).toBe(true)
  })

  it("passes plain-text bodies through untouched", () => {
    expect(htmlToPreview("Ciao, confermo per le 14. Grazie")).toBe("Ciao, confermo per le 14. Grazie")
  })

  it("removes script contents, never leaving code in the row", () => {
    expect(htmlToPreview('<script>alert("x")</script><p>Ciao</p>')).toBe("Ciao")
  })

  it("removes HTML comments, including Outlook conditionals", () => {
    expect(htmlToPreview("<!--[if mso]><i>x</i><![endif]--><p>Ciao</p>")).toBe("Ciao")
  })

  it("handles a doctype-prefixed document like Scidoo and Amazon send", () => {
    const body =
      '<!doctype html><html lang="it" dir="auto"><head><meta charset="UTF-8" /></head>' +
      "<body><p>Ordinato: Mastro Lindo Gomma Magica</p></body></html>"
    expect(htmlToPreview(body)).toBe("Ordinato: Mastro Lindo Gomma Magica")
  })
})
