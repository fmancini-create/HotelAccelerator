# HR — configurazione sede, mappa e geofence

Stato ufficiale della capability: **Codice** sulla PR #406 (`feat/hr-geofence-address-map`). Non promuovere a `Tenant reale` prima di un salvataggio e una timbratura autenticata su una struttura reale.

## Obiettivo

L'amministratore non deve conoscere latitudine e longitudine. La configurazione in `/admin/hr` segue questo flusso:

1. inserisce l'indirizzo della sede;
2. preme `Cerca`;
3. HotelAccelerator geocodifica l'indirizzo lato server;
4. compare la mappa con un segnaposto centrale;
5. l'amministratore trascina la mappa o clicca sul punto esatto;
6. imposta il raggio di copertura tra 25 m e 5 km;
7. salva indirizzo, coordinate tecniche e raggio in `hr_settings`.

Esempi supportati senza configurazioni speciali:

- hotel/villa: **300 m**;
- stabilimento/campus: **3 km**.

Le coordinate restano nel modello dati perché servono al calcolo della distanza durante la timbratura, ma non sono più campi che l'amministratore deve compilare manualmente.

## Dati e compatibilità

Non viene introdotta alcuna nuova tabella o migration.

Si riusano i campi esistenti di `hr_settings`:

- `location_name`: indirizzo scelto/normalizzato;
- `latitude` / `longitude`: punto centrale tecnico;
- `geofence_radius_m`: raggio in metri;
- `require_geolocation`;
- `allow_outside_geofence`.

L'API HR continua a validare il raggio tra 25 e 5000 metri e le coordinate nel dominio geografico valido. Le timbrature esistenti e il calcolo fuori-geofence non cambiano.

## Mappa

La mappa usa tile OpenStreetMap direttamente dal browser e implementa nel Core la proiezione Web Mercator necessaria per:

- pan tramite trascinamento;
- click per centrare il punto;
- zoom con pulsanti, rotellina e tastiera;
- cerchio di copertura in scala rispetto al raggio impostato;
- adattamento automatico dello zoom quando cambia il raggio.

Non è stata aggiunta una dipendenza JavaScript di mapping. Questo evita nuovo peso client e lockfile, mantenendo il componente sostituibile in futuro.

## Geocodifica

`lib/hr/geocoding.ts` è l'adapter provider-specifico. L'API pubblica del client è `/api/admin/hr/geocode` e non espone direttamente il provider.

Provider iniziale: OpenStreetMap/Nominatim.

Vincoli applicati:

- chiamata solo server-side;
- accesso solo tenant admin/superadmin tramite `requireTenantAdmin`;
- modulo HR attivo obbligatorio;
- query 3–180 caratteri;
- massimo 5 risultati;
- timeout 5 secondi;
- cache server del lookup per ridurre chiamate ripetute;
- nessun token o segreto nel browser.

La mappa mostra l'attribuzione OpenStreetMap richiesta.

## Privacy e provider

Il browser scarica i tile cartografici da OpenStreetMap quando l'amministratore apre la mappa; il provider cartografico vede quindi i normali metadati di rete della richiesta del browser. La geocodifica dell'indirizzo passa invece dal backend HotelAccelerator.

Prima di volumi elevati o rollout enterprise va rivalutato il provider cartografico/geocoder in base a SLA, termini d'uso, rate limit e privacy. L'adapter evita che questa scelta sia incorporata nella logica HR.

## Gate prima di `Tenant reale`

- ricerca di un indirizzo reale e scelta di un risultato;
- correzione del punto tramite trascinamento/click;
- verifica visiva del cerchio con 300 m;
- verifica visiva del cerchio con 3 km;
- salvataggio e ricaricamento pagina senza perdita del punto;
- timbratura dentro il raggio;
- timbratura fuori raggio con policy di blocco;
- timbratura fuori raggio con `allow_outside_geofence=true` e stato `needs_review`;
- prova mobile e desktop;
- verifica che un tenant non possa leggere o modificare la configurazione di un altro tenant;
- verifica comportamento quando il geocoder non risponde: configurazione non salvata per errore e nessuna perdita dei dati esistenti.

## Rollback

Rollback applicativo: ripristinare il precedente editor delle coordinate mantenendo invariato `hr_settings`. Non serve rollback dati o migration perché il formato persistito non cambia.
