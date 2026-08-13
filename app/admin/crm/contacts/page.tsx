import { redirect } from "next/navigation"

/**
 * Elenco contatti.
 *
 * Perche' un rimando e non una nuova pagina: l'elenco dei contatti ESISTE GIA'
 * ed e' la scheda predefinita della dashboard CRM (`Tabs defaultValue="contacts"`),
 * completa di ricerca, filtri VIP, tabella, selezione multipla, modifica e
 * import/export su `/api/admin/crm/contacts` — 847 contatti reali. Ricostruire
 * qui un secondo elenco avrebbe duplicato ~700 righe di interfaccia destinate a
 * divergere dalla prima al primo cambiamento.
 *
 * Questa rotta mancava del tutto: `app/admin/crm/contacts/` conteneva solo
 * `[contactId]`, quindi ogni collegamento a `/admin/crm/contacts` restituiva 404
 * (nessuna riscrittura in next.config lo copriva). Il menu del nuovo spazio di
 * lavoro commerciale punta proprio qui.
 *
 * Il permesso d'area resta garantito: `app/admin/crm/layout.tsx` esegue
 * `requireAreaPage("crm")` e avvolge anche questa rotta, quindi chi non ha
 * l'area CRM non arriva ne' qui ne' alla destinazione.
 */
export default function CrmContactsPage() {
  redirect("/admin/crm")
}
