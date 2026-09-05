# 4BID Voice Agent — resilienza a rumore e false interruzioni

Data: 2026-09-02

## Stato

`Specifica` / lavoro in corso fino al collaudo sul PBX reale.

Roadmap key: `ai-voice-noise-resilience`.

## Problema osservato

Il Voice Agent 4BID puo' interrompere la propria risposta quando il canale audio rileva un rumore breve, eco, tosse, traffico, tastiera o altra attivita' non linguistica come se fosse un intervento del chiamante.

Il comportamento e' compatibile con un falso barge-in/VAD: OpenAI Realtime interrompe normalmente la risposta quando rileva voce in ingresso. Nel Call Script 3CX attualmente usato, `StartOpenAiVoiceSessionAsync(...)` espone chiave, modello, istruzioni, voce e nome agente, ma non espone nella firma usata una soglia VAD configurabile. Non va quindi dichiarato che il Core possa correggere direttamente la sensibilita' acustica del motore 3CX/OpenAI.

## Correzione immediata v13

La correzione minima e reversibile mantiene invariati routing, fallback 820, tool `ask_4bid`, caller number, modello e segreti. Viene aggiunta alle istruzioni dell'agente una policy esplicita:

- considerare vera interruzione solo parole umane comprensibili e pertinenti;
- ignorare rumori brevi/non verbali e turni privi di contenuto linguistico utile;
- se una falsa interruzione tronca la risposta, riprendere immediatamente il concetto senza commentare il rumore;
- non cambiare argomento, non trasferire e non restare in silenzio per rumore/eco;
- chiedere di ripetere solo dopo ambiguita' linguistica ripetuta.

Il file operativo generato per il PBX e':

`4BID_0558290741_VoiceAgent_PROD_v13_noise_hardened.cs`

E' derivato dalla v12 che ha gia' compilato sul PBX reale e modifica soltanto il blocco `AgentInstructions`.

## Limite tecnico

Questa v13 migliora il recupero da falsi turni, ma non cambia la soglia acustica del VAD sottostante. Se il provider cancella l'audio prima che il modello possa distinguere rumore da parlato, il passo successivo corretto non e' aumentare prompt o timeout: e' usare un percorso in cui il VAD sia configurabile.

3CX documenta oggi le **Programmable Extensions** come opzione per applicazioni AI realtime esterne e indica che i file `config.yaml.example` dei provider sono la fonte per modello, voce, VAD e impostazioni specifiche. Questo permette, se necessario, di controllare la sensibilita' senza riscrivere il PBX e mantenendo 3CX come telefonia/call control.

## Collaudo obbligatorio

Prima di chiudere la roadmap:

1. installare la v13 nello stesso script `ivr4bidhaingr` legato al DID 0558290741;
2. verificare compilazione verde in 3CX;
3. effettuare una chiamata reale in ambiente silenzioso;
4. ripetere con rumori brevi volontari mentre l'assistente parla: colpo sul tavolo, tosse, tastiera, voce lontana;
5. verificare che il bot riprenda la frase invece di restare bloccato;
6. verificare un vero barge-in parlato per assicurarsi che l'utente possa ancora interrompere volontariamente;
7. verificare che fallback operatore resti 820 e che `ask_4bid` continui a funzionare.

Solo dopo questo test la capability puo' diventare `Online` nella roadmap.

## Rollback

Ripristinare la v12 del Call Script. Nessuna migrazione dati, nessun cambio tenant, nessun cambio di chiavi o provider e' necessario.
