# SANTADDEO - CORE PROJECT RULES

## 1. NESSUN DATO SIMULATO
Santaddeo non deve mai utilizzare:
- dati mock
- variabili inventate
- valori placeholder
- punteggi sintetici fittizi

Se un dato reale non e' disponibile:
- il sistema deve segnalarlo
- non deve inventarlo

## 2. PREZZO SEMPRE SPIEGABILE
Ogni prezzo generato deve poter mostrare:
- scenario (alta / bassa / intermedia occupazione)
- dati reali utilizzati
- pressione domanda scomposta per fonte
- eventuale last minute applicato
- motivazione tecnica leggibile

Santaddeo e' anche uno strumento educativo.

## 3. PRESSIONE DOMANDA MULTICANALE
La pressione della domanda non dipende solo da occupazione.
Deve derivare da:
- Occupazione storica reale
- Occupazione attuale reale
- Camere residue reali
- ADR storico reale
- Variabili pagina prezzi
- Eventi reali
- Analytics sito ufficiale
- Performance OTA caricate e storicizzate

Ogni componente deve essere:
- tracciabile
- pesabile
- modificabile
- storicizzata

## 4. PESI CONFIGURABILI, NON IMPOSTI
Il sistema deve permettere al revenue manager di:
- pesare Booking
- pesare Expedia
- pesare sito diretto
- pesare variabili interne

Santaddeo suggerisce. Non impone.

## 5. LAST MINUTE = CORREZIONE, NON PROMOZIONE
Il last minute e':
- una correzione di errore tariffario
- attivabile solo in condizioni di protezione cancellazione
- proporzionato alle camere residue reali

Mai automatico senza condizioni reali.

## 6. TUTTO STORICIZZATO
Ogni dato caricato o generato deve essere:
- salvato
- tracciabile nel tempo
- confrontabile

Santaddeo deve costruire memoria.

## 7. STRUTTURA DIMENSIONALE
Il comportamento del pricing deve adattarsi a:
- numero reale di camere
- rischio operativo della struttura

Poche camere = prudenza maggiore.
Molte camere = curva piu' progressiva.

## 8. ALERT INTELLIGENTI, NON GENERICI
Ogni alert deve:
- derivare da dati reali
- indicare causa tecnica
- suggerire azione concreta

No frasi generiche.
