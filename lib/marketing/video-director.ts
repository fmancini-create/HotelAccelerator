import "server-only"

import { generateObject } from "ai"
import { z } from "zod"
import { CHAT_MODEL } from "@/lib/ai/config"

const storyboardSchema = z.object({
  title: z.string().min(1).max(120),
  master_prompt: z.string().min(50).max(9000),
  scenes: z
    .array(
      z.object({
        start_second: z.number().min(0).max(30),
        end_second: z.number().min(0).max(30),
        visual: z.string().min(10).max(1200),
        camera: z.string().min(3).max(500),
        overlay_hint: z.string().max(300).nullable(),
      }),
    )
    .min(2)
    .max(8),
})

export type VideoStoryboard = z.infer<typeof storyboardSchema>

export interface DirectVideoInput {
  brief: string
  durationSeconds: number
  aspectRatio: "16:9" | "9:16"
  resolution: "720p" | "1080p"
  generateAudio: boolean
}

/**
 * Turns a founder-level marketing brief into one deterministic production prompt.
 * The video provider receives no tenant data beyond the brief supplied for this job.
 */
export async function directVideo(input: DirectVideoInput): Promise<VideoStoryboard> {
  const system = [
    "You are the senior creative director for premium hospitality technology commercials.",
    "Turn the user's business idea into a physically coherent, photorealistic video plan and one production-ready prompt.",
    `The final video is exactly ${input.durationSeconds} seconds, ${input.aspectRatio}, ${input.resolution}.`,
    "Prefer visual storytelling over readable UI. Do not ask the video model to render long text, tiny dashboards, URLs or precise logos.",
    "When product names are important, reserve clean visual moments for overlays to be added later by the application.",
    "Keep the same main person and the same hotel visually consistent throughout the film.",
    "Use realistic hotel operations, natural hands and faces, plausible lighting, premium commercial cinematography and smooth camera movement.",
    "No invented claims, fake numbers, unreadable text, watermarks or extra brands.",
    "The master_prompt must be in English because video models follow cinematic instructions more reliably in English.",
    "The storyboard descriptions may be in Italian.",
  ].join("\n")

  const prompt = [
    "BRIEF DEL VIDEO:",
    input.brief.trim(),
    "",
    "VINCOLI:",
    `- durata: ${input.durationSeconds}s`,
    `- formato: ${input.aspectRatio}`,
    `- risoluzione richiesta: ${input.resolution}`,
    `- audio nativo: ${input.generateAudio ? "si" : "no"}`,
    "- costruisci una storia con inizio, crescita, trasformazione e chiusura memorabile",
    "- ogni scena deve avere start_second < end_second e le scene devono coprire quasi tutta la durata",
    "- overlay_hint contiene solo eventuali testi/loghi da sovrapporre dopo, non da far scrivere al generatore video",
  ].join("\n")

  const { object } = await generateObject({
    model: CHAT_MODEL,
    schema: storyboardSchema,
    system,
    prompt,
  })

  return object
}
