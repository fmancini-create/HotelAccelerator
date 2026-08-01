export type SpeechRecognitionAlternativeLike = { transcript: string }
export type SpeechRecognitionResultLike = { isFinal: boolean; 0: SpeechRecognitionAlternativeLike }
export type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> }

export type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export function createBrowserSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Recognition) return null

  const recognition = new Recognition()
  recognition.lang = "it-IT"
  recognition.interimResults = true
  recognition.continuous = false
  return recognition
}
