"use client"

import { useEffect } from "react"

const AAC_MIME_CANDIDATES = [
  'audio/mp4;codecs="mp4a.40.2"',
  "audio/mp4;codecs=mp4a.40.2",
]

/**
 * Chrome/Chromium can report generic `audio/mp4` as recordable while choosing
 * an MP4/Opus (or otherwise non-WhatsApp-compatible) encoding. Meta accepts
 * `audio/mp4` only when the underlying file is a media format it can actually
 * process; generic MediaRecorder output has produced delivery error 131053.
 *
 * The Inbox voice recorder intentionally asks for OGG/Opus first. When OGG is
 * unavailable it falls back to `audio/mp4`. This compatibility shim narrows
 * that fallback to AAC-LC (`mp4a.40.2`) when the browser exposes it. If AAC-LC
 * is not supported we make generic `audio/mp4` report unsupported, so the UI
 * refuses the recording instead of uploading a mislabeled file that Meta will
 * later reject after the customer accepts the 24h reopen template.
 */
export function WhatsAppMediaRecorderCompat() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return

    const NativeMediaRecorder = window.MediaRecorder
    const nativeIsTypeSupported = NativeMediaRecorder.isTypeSupported.bind(NativeMediaRecorder)
    const aacMime = AAC_MIME_CANDIDATES.find((mime) => nativeIsTypeSupported(mime)) || null

    const PatchedMediaRecorder = new Proxy(NativeMediaRecorder, {
      construct(target, args) {
        const [stream, options] = args as [MediaStream, MediaRecorderOptions | undefined]
        if (options?.mimeType === "audio/mp4") {
          if (!aacMime) {
            throw new DOMException(
              "Il browser non dispone di un encoder AAC compatibile con WhatsApp.",
              "NotSupportedError",
            )
          }
          return Reflect.construct(target, [stream, { ...options, mimeType: aacMime }])
        }
        return Reflect.construct(target, args)
      },
      get(target, property, receiver) {
        if (property === "isTypeSupported") {
          return (mimeType: string) => {
            if (mimeType === "audio/mp4") return Boolean(aacMime)
            return nativeIsTypeSupported(mimeType)
          }
        }
        return Reflect.get(target, property, receiver)
      },
    }) as typeof MediaRecorder

    window.MediaRecorder = PatchedMediaRecorder

    return () => {
      if (window.MediaRecorder === PatchedMediaRecorder) {
        window.MediaRecorder = NativeMediaRecorder
      }
    }
  }, [])

  return null
}
