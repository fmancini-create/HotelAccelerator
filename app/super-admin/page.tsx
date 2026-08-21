import { redirect } from "next/navigation"

/**
 * /super-admin non e' piu' un cruscotto: rimanda a quello unico.
 *
 * PERCHE'. Qui c'era una seconda dashboard, gemella di /admin/dashboard: due
 * pagine con due intestazioni, due menu e due elenchi di scorciatoie da tenere
 * allineati a mano. Ora la vista d'insieme sulla piattaforma e' un pannello in
 * cima al cruscotto unico (PlatformOverviewPanel), sopra i dati della struttura
 * su cui si sta lavorando.
 *
 * PERCHE' UN RINVIO E NON UNA CANCELLAZIONE. L'indirizzo e' in circolazione: e'
 * dove il login portava chi amministra la piattaforma, ed e' probabilmente nei
 * segnalibri. Cancellare la pagina darebbe un 404 a chi ha fatto esattamente
 * quello che il prodotto gli ha insegnato a fare.
 *
 * Non c'e' nessun controllo di ruolo qui, di proposito: chi non e' autorizzato
 * viene fermato dal layout di /admin, che e' l'unico posto dove quella
 * decisione vive. Duplicare la guardia qui creerebbe una seconda regola da
 * tenere allineata — cioe' il problema che questa modifica sta rimuovendo.
 */
export default function SuperAdminIndexPage() {
  redirect("/admin/dashboard")
}
