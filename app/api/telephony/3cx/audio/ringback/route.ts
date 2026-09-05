import { NextResponse } from "next/server"

const SAMPLE_RATE = 8_000
const AMPLITUDE = 0.18
const FREQUENCY_HZ = 425

function sampleCount(milliseconds: number): number {
  return Math.round((SAMPLE_RATE * milliseconds) / 1000)
}

function writeTone(target: Int16Array, offset: number, milliseconds: number): number {
  const count = sampleCount(milliseconds)
  for (let i = 0; i < count; i += 1) {
    const envelopeSamples = Math.max(1, sampleCount(20))
    const fadeIn = Math.min(1, i / envelopeSamples)
    const fadeOut = Math.min(1, (count - i - 1) / envelopeSamples)
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut))
    const value = Math.sin((2 * Math.PI * FREQUENCY_HZ * i) / SAMPLE_RATE) * AMPLITUDE * envelope
    target[offset + i] = Math.round(value * 32767)
  }
  return offset + count
}

function writeSilence(offset: number, milliseconds: number): number {
  return offset + sampleCount(milliseconds)
}

function wavBuffer(samples: Int16Array): Buffer {
  const dataBytes = samples.length * 2
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < samples.length; i += 1) buffer.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  return buffer
}

/**
 * Prompt di ringback controllato dal PBX: due squilli sintetici a 425 Hz.
 * Formato volutamente 8 kHz / 16 bit / mono, compatibile con i prompt 3CX.
 */
export async function GET() {
  const durationMs = 1_000 + 900 + 1_000 + 250
  const samples = new Int16Array(sampleCount(durationMs))
  let offset = 0
  offset = writeTone(samples, offset, 1_000)
  offset = writeSilence(offset, 900)
  offset = writeTone(samples, offset, 1_000)
  writeSilence(offset, 250)

  return new NextResponse(wavBuffer(samples), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": 'attachment; filename="4bid-due-squilli-3cx.wav"',
      "Cache-Control": "public, max-age=3600",
    },
  })
}
