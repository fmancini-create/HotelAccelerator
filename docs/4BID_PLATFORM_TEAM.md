# Team 4BID e privilegi di piattaforma

Ultimo aggiornamento: 2026-09-04

## Decisione

Il tenant aziendale HotelAccelerator con `properties.slug = '4bid'` e `properties.type = 'company'` e' l'anagrafica operativa delle persone che lavorano per 4BID sulla piattaforma.

`admin_users` del tenant 4BID possiede quindi identita' operativa, ruolo tenant, gruppi e permessi del collaboratore. `platform_collaborators` non e' una seconda rubrica: resta esclusivamente l'overlay dei privilegi globali necessari ad amministrare HotelAccelerator, in coerenza con ADR-018.

## Invarianti di sicurezza

- Essere membro del tenant 4BID non concede automaticamente accesso ad altri tenant.
- Un privilegio globale puo' essere assegnato solo a un indirizzo email gia' presente nel Team 4BID.
- I ruoli globali ammessi restano quelli supportati dal database: `super_admin`, `support`, `viewer`.
- Il ruolo e i dati anagrafici 4BID si gestiscono nell'area tenant; la pagina SuperAdmin gestisce solo l'overlay globale.
- La pagina SuperAdmin risolve il tenant 4BID lato server tramite slug e tipo; non accetta un tenant arbitrario dal browser.
- I record globali storici non associati al Team 4BID non vengono cancellati automaticamente. Sono esposti separatamente per audit e richiedono una decisione esplicita per la bonifica.
- La modifica del proprio ruolo `super_admin` verso un ruolo inferiore e' bloccata lato server per evitare auto-lockout.

## Flusso UI

`/super-admin/collaborators` mostra l'elenco proveniente da `admin_users` del tenant 4BID e, per ciascuna persona, l'eventuale record `platform_collaborators` associato per email normalizzata.

Da questa pagina il SuperAdmin puo':

1. aprire direttamente la gestione utenti del tenant 4BID, dopo uno switch tenant autorizzato server-side;
2. abilitare un privilegio globale a un membro 4BID;
3. cambiare il ruolo globale ammesso;
4. sospendere o riattivare i privilegi globali non protetti;
5. distinguere chiaramente collaboratori 4BID e record tecnici/storici globali.

## Stato e limiti

Stato corrente della capability in questa branch: `Codice`.

Prima della promozione oltre `Codice` servono merge, deploy e collaudo con almeno un secondo collaboratore 4BID non SuperAdmin, verificando che:

- il collaboratore compaia nella pagina senza un duplicato anagrafico;
- il solo ruolo 4BID non apra superfici SuperAdmin;
- l'abilitazione globale appaia immediatamente e resti separata dai permessi tenant;
- sospensione e riattivazione non modifichino l'appartenenza al tenant 4BID;
- nessun accesso cross-tenant sia possibile senza privilegio globale esplicito.

## Rollback

La modifica non elimina tabelle e non migra identita'. Il rollback applicativo consiste nel ripristinare la precedente pagina/API Collaboratori. I record esistenti in `admin_users` e `platform_collaborators` rimangono compatibili con il modello precedente.
