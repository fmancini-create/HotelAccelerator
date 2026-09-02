#nullable disable
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using CallFlow;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace OpenAiVoiceAgentScripts
{
    // Canonical repository copy of the 4BID script installed manually in 3CX.
    // Based on the production v12 script that compiled successfully on 3CX V20 U10.
    //
    // IMPORTANT: the complete operational script remains the PBX-installed copy. This
    // repository version exists so future changes are versioned instead of reconstructed
    // from chat history. v13 adds prompt-level recovery from false barge-in/noise events.
    //
    // NOTE: StartOpenAiVoiceSessionAsync in the currently used 3CX AI Call Script API
    // exposes key/model/instructions/voice/agent name but no documented VAD threshold.
    // Therefore this change does not claim to alter the underlying acoustic VAD. It makes
    // the agent resume naturally when a short/non-linguistic interruption creates a turn.
    public static class FourBidVoiceNoisePolicy
    {
        public const string PromptBlock = @"
RUMORE DI FONDO E FALSE INTERRUZIONI

Durante una telefonata possono esserci rumori ambientali, colpi, porte, traffico, tastiera, tosse, respiro, eco, musica, televisioni o altre voci lontane.

Considera una vera interruzione del chiamante solo quando percepisci parole umane comprensibili e pertinenti alla conversazione.

Se mentre stai parlando vieni interrotto da un suono breve, da rumore non verbale, da una parola incomprensibile o da audio che non esprime chiaramente un nuovo intento:
- NON cambiare argomento;
- NON fare una nuova domanda;
- NON proporre trasferimenti;
- NON restare in silenzio;
- riprendi immediatamente e in modo naturale la frase o il concetto che stavi esponendo, senza commentare il rumore.

Se il disturbo produce un turno vuoto o privo di contenuto linguistico utile, trattalo come se il chiamante non avesse parlato e continua.

Interrompi davvero la tua risposta solo quando il chiamante pronuncia parole comprensibili che mostrano che vuole intervenire, correggere, fare una domanda, chiedere di aspettare o cambiare direzione.

Se non sei sicuro se si tratti di voce o rumore, non bloccare la conversazione al primo episodio: continua. Chiedi di ripetere soltanto se il contenuto parlato resta ambiguo per due tentativi consecutivi.

Non chiudere mai la chiamata e non attivare fallback o operatore a causa di rumore, eco, silenzio o una falsa interruzione.
";
    }
}
