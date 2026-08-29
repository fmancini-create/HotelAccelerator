# ManuBot entitlement provisioning

Stato: Codice

## Fonte autorevole

`tenant_modules` resta la fonte autorevole per stabilire se il tenant puo' usare ManuBot. I campi tecnici `properties.manubot_*` descrivono soltanto il collegamento al tenant esterno ManuBot e non sostituiscono l'entitlement.

## Bootstrap della configurazione legacy

Una property con configurazione tecnica ManuBot completa (`manubot_company_id`, `manubot_email`, `manubot_password`, `manubot_supabase_url`) deve avere una riga `tenant_modules` per `module_key = 'manubot'`.

La migrazione `20260829174400_bootstrap_manubot_entitlement_from_config.sql` introduce un trigger nello stesso database Core che:

- crea `tenant_modules(manubot, active)` solo quando la riga non esiste;
- non modifica mai una riga gia' esistente;
- preserva quindi uno stato esplicito `inactive`, `trial` o `active` deciso dal superadmin;
- non disattiva l'entitlement se la configurazione tecnica viene rimossa;
- usa solo dati della stessa property e non effettua accessi cross-database;
- e' idempotente grazie al vincolo unico `(property_id, module_key)` e `ON CONFLICT DO NOTHING`.

La stessa migrazione riconcilia soltanto eventuali property gia' configurate che non hanno ancora alcuna riga ManuBot. Non sovrascrive stati esistenti.

## Sicurezza e rollback

La funzione del trigger non usa `SECURITY DEFINER` e imposta `search_path = ''`; tutti gli oggetti sono qualificati con schema `public`.

Rollback applicativo: rimuovere il trigger e la funzione. Le righe di entitlement create dal bootstrap rappresentano configurazioni tecniche gia' complete e non vengono eliminate automaticamente dal rollback; eventuali rettifiche devono essere deliberate per singolo tenant.

## Verifica

Prima del rilascio e' stato eseguito un test transazionale con rollback sulla property Villa I Barronci:

1. riga entitlement temporaneamente rimossa -> un aggiornamento della configurazione completa la ricrea `active`;
2. riga impostata temporaneamente `inactive` -> un nuovo aggiornamento della configurazione non la riattiva;
3. rollback completo -> lo stato reale del tenant resta `active`.

Il passaggio a `Tenant reale` dell'integrazione ManuBot richiede comunque una chiamata autenticata end-to-end HotelAccelerator -> ManuBot; questo provisioning non cambia da solo lo stato ufficiale dell'integrazione.
