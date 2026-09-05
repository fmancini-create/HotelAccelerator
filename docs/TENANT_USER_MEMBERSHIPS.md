# Tenant user memberships

## Regola di progetto

Una persona HotelAccelerator può appartenere a più tenant senza duplicare l'account di autenticazione.

- `admin_users` identifica la persona e mantiene `property_id` solo come tenant primario legacy/compatibilità.
- `tenant_user_memberships` è la fonte autorevole dell'appartenenza ai tenant e dei permessi tenant-specifici.
- Tutti gli elenchi di persone contestuali a un tenant (Team, interni telefonici, collaboratori 4BID, permessi) devono partire da `tenant_user_memberships`, non da `admin_users.property_id`.
- Rimuovere una persona da un tenant elimina la membership; l'account Auth/identità si elimina solo se non esistono altre membership.
- Una stessa persona non deve essere copiata in `admin_users` per ogni tenant: `admin_users.email` è univoca e l'identità resta una sola.

Questo evita il bug in cui un utente già attivo in un altro tenant spariva dagli elenchi del tenant corrente o veniva bloccato come "email già associata".
