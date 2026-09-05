# HR — configurazione sede, mappa e geofence

Stato ufficiale della capability: **Codice**. La mappa da indirizzo e raggio nasce con PR #406; il successivo hardening separa la configurazione amministrativa dalla gestione operativa HR. Non promuovere a `Tenant reale` prima di salvataggio, ricaricamento e timbratura autenticata su una struttura reale.

## Obiettivo

L'amministratore non deve conoscere latitudine e longitudine. La configurazione vive in `/admin/settings/hr`, separata dalla pagina operativa `/admin/hr`, e segue questo flusso:

1. l'amministratore inserisce l'indirizzo della sede;
2. preme `Cerca`;
3. HotelAccelerator geocodifica l'indirizzo lato server;
4. compare la mappa con un segnaposto centrale;
5. l'amministratore trascina la mappa o clicca sul punto esatto;
6. imposta il raggio di copertura tra 25 m e 5 km;
7. salva indirizzo, coordinate tecniche, raggio e regole GPS in `hr_settings`.

Esempi supportati senza configurazioni speciali:

- hotel/villa: **300 m**;
- stabilimento/campus: **3 km**.

Le coordinate restano nel modello dati perché servono al calcolo della distanza durante la timbratura, ma non sono campi che l'amministratore deve compilare manualmente.

## Confine autorizzativo

La posizione di timbratura è configurazione amministrativa e non gestione turni.

- La voce `HR · Timbratura e posizione` è `adminOnly` nel manifesto di navigazione e compare solo se il modulo HR è attivo.
- La pagina `/admin/settings/hr` verifica lato server che l'utente sia tenant admin o superadmin e che HR sia attivo.
- Lettura e scrittura usano esclusivamente `/api/admin/hr/settings`, protetta da `requireTenantAdmin`.
- L'API operativa `/api/admin/hr` non legge più `hr_settings` e non accetta più l'azione `settings`.
- La pagina `/admin/hr` non contiene più l'editor geofence.

Questo confine resta valido anche quando la gestione operativa dei turni verrà delegata a utenti non amministratori: quel permesso non deve implicare la possibilità di cambiare sede, raggio o policy GPS.

## Dati e compatibilità

Non viene introdotta alcuna nuova tabella o migration.

Si riusano i campi esistenti di `hr_settings`:

- `location_name`: indirizzo scelto/normalizzato;
- `latitude` / `longitude`: punto centrale tecnico;
- `geofence_radius_m`: raggio in metri;
- `require_geolocation`;
- `allow_outside_geofence`;
- `updated_by` / `updated_at`: ultimo amministratore e ultimo aggiornamento.

L'API amministrativa valida il raggio tra 25 e 5000 metri e le coordinate nel dominio geografico valido. Dopo il salvataggio restituisce il record persistito e la UI si riallinea alla risposta del server prima di mostrare il successo. Ogni modifica tenta inoltre di scrivere un evento `hr_geofence_settings_updated` in `hr_audit_log`.

Le timbrature esistenti e il calcolo fuori-geofence non cambiano.

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

## Verifica salvataggio Villa I Barronci

Il 2026-09-05 è stato verificato direttamente sul database di produzione che un salvataggio effettuato dalla UI ha aggiornato `hr_settings` per Villa I Barronci alle 18:00:47 UTC (20:00:47 Europe/Rome), con indirizzo e coordinate persistiti. Il raggio risultava **200 m** in quel salvataggio; per il target Barronci di **300 m** serve impostare 300 m e salvare nuovamente.

Questa evidenza verifica la persistenza del salvataggio, ma non basta da sola a promuovere la capability a `Tenant reale`: manca ancora la prova completa ricaricamento + timbratura dentro/fuori raggio su smartphone reale.

## Gate prima di `Tenant reale`

- ricerca di un indirizzo reale e scelta di un risultato;
- correzione del punto tramite trascinamento/click;
- verifica visiva del cerchio con 300 m;
- verifica visiva del cerchio con 3 km;
- salvataggio e ricaricamento pagina senza perdita del punto;
- prova che un membro non-admin con accesso operativo HR non veda né possa scrivere la configurazione;
- timbratura dentro il raggio;
- timbratura fuori raggio con policy di blocco;
- timbratura fuori raggio con `allow_outside_geofence=true` e stato `needs_review`;
- prova mobile e desktop;
- verifica che un tenant non possa leggere o modificare la configurazione di un altro tenant;
- verifica comportamento quando il geocoder non risponde: configurazione non salvata per errore e nessuna perdita dei dati esistenti.

## Rollback

Rollback applicativo: ripristinare la precedente superficie amministrativa mantenendo invariato `hr_settings`. Non serve rollback dati o migration perché il formato persistito non cambia.
