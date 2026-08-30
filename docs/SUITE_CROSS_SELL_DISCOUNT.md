# Sconto cross-sell della suite

Stato: Codice

## Regola commerciale

HotelAccelerator Core e' la fonte autorevole della regola commerciale trasversale.

Un cliente che possiede gia almeno un prodotto della suite (`hotelaccelerator`, `santaddeo`, `hotelprofitai`, `manubot`) puo ricevere uno sconto sul nuovo prodotto che sta acquistando. Il prodotto gia posseduto non viene scontato retroattivamente.

Valori iniziali:

- sconto cross-sell abilitato;
- percentuale: 10%;
- cumulo con altre promozioni: disabilitato.

La percentuale e il comportamento di cumulo sono modificabili esclusivamente dal superadmin nella pagina Moduli.

## Idoneita

Per HotelAccelerator, l'idoneita deriva dal possesso di almeno un satellite collegato/attivo.

Per Santaddeo, HotelProfitAI o ManuBot, l'idoneita deriva dal possesso di HotelAccelerator oppure di un altro satellite. Il prodotto target non puo rendere idoneo se stesso.

Il calcolo avviene lato server; il browser non decide percentuale, prezzo o idoneita.

## Prezzi e checkout

Le schede dei moduli mostrano il vantaggio cliente 4BID e, quando esiste un prezzo, il prezzo pieno barrato e quello scontato.

Il checkout HotelAccelerator ricalcola sempre lo sconto lato server e registra l'origine dello sconto nei metadata Stripe. Se il cumulo e' disabilitato, i promotion code Stripe non sono disponibili quando lo sconto cross-sell e' applicato.

Lo sconto non si applica automaticamente alle fee una tantum di setup.

## Sicurezza e audit

Le tabelle `suite_commercial_settings` e `suite_commercial_settings_audit` sono backend-only: RLS attiva, accesso revocato ad `anon` e `authenticated`, accesso riservato al service role.

Ogni modifica delle impostazioni genera una riga audit con valori precedenti/nuovi e identita del superadmin quando disponibile.

## Limiti attuali

I prezzi dei moduli Santaddeo, HotelProfitAI e ManuBot risultano ancora non valorizzati nel catalogo: la UI mostra quindi l'idoneita e la percentuale, ma il prezzo finale potra essere calcolato solo dopo la configurazione del costo/prezzo del modulo.

L'attivazione self-service dei prodotti satellite resta separata: il sistema di entitlement esistente continua a richiedere superadmin/checkout finche il provisioning commerciale dei singoli satelliti non viene collegato.
