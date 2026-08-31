import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { createServiceClient } from "@/lib/supabase/server"
import { directVideo } from "@/lib/marketing/video-director"
import { createBytePlusVideoTask, getBytePlusVideoTask } from "@/lib/integrations/byteplus/video"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TOKEN_HASH = "519ff1c16f7a20061734801217f7804d24dac7640e456033ca064d8a445a037b"
const BRIEF = `Crea uno spot cinematografico premium per Hotel Accelerator. Il protagonista e' un albergatore italiano: deve essere chiaro che gestisce personalmente il suo hotel e si impegna in mille modi per aumentare il numero di potenziali clienti intorno alla struttura. Visualizza la domanda che cresce come centinaia e poi migliaia di segnali/luci che convergono verso l'hotel; occupazione e prezzo medio salgono. Poi mostra, come attivazioni progressive e visivamente eleganti: Santaddeo per revenue management e pricing; ManuBot per manutenzioni; HotelProfitAI per controllo di gestione, entrate, uscite e marginalita'. Infine tutto converge in Hotel Accelerator e il sistema va metaforicamente al turbo: hotel pieno, gestione sotto controllo, proprietario sereno. Stile luxury hospitality, tecnologia premium, ultra realistico, niente dashboard illeggibili, niente testo leggibile e niente loghi inventati.`

function authorized(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || ""
  return createHash("sha256").update(token).digest("hex") === TOKEN_HASH
}

async function persistOutput(jobId: string, providerUrl: string) {
  const response = await fetch(providerUrl, { cache: "no-store" })
  if (!response.ok) throw new Error(`Download video fallito: ${response.status}`)
  const body = await response.blob()
  const blob = await put(`ai-video/smoke/${jobId}.mp4`, body, {
    access: "public",
    contentType: response.headers.get("content-type") || "video/mp4",
    addRandomSuffix: false,
  })
  return blob.url
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const supabase = createServiceClient()
    const jobId = request.nextUrl.searchParams.get("job")

    if (jobId) {
      const { data: job, error } = await supabase
        .from("ai_video_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("provider", "byteplus")
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!job?.provider_task_id) return NextResponse.json({ error: "Job non trovato" }, { status: 404 })

      const remote = await getBytePlusVideoTask(job.provider_task_id)
      const now = new Date().toISOString()
      if (remote.status === "succeeded" && remote.content?.video_url) {
        const outputUrl = job.output_url || (await persistOutput(job.id, remote.content.video_url))
        await supabase
          .from("ai_video_jobs")
          .update({ status: "succeeded", output_url: outputUrl, provider_response: remote, completed_at: now, updated_at: now })
          .eq("id", job.id)
        return NextResponse.json({ jobId: job.id, status: "succeeded", outputUrl })
      }
      if (["failed", "expired", "cancelled"].includes(remote.status)) {
        const message = remote.error?.message || `Generazione ${remote.status}`
        await supabase
          .from("ai_video_jobs")
          .update({ status: remote.status === "cancelled" ? "cancelled" : "failed", error_message: message, provider_response: remote, completed_at: now, updated_at: now })
          .eq("id", job.id)
        return NextResponse.json({ jobId: job.id, status: remote.status, error: message })
      }
      await supabase
        .from("ai_video_jobs")
        .update({ status: remote.status, provider_response: remote, updated_at: now })
        .eq("id", job.id)
      return NextResponse.json({ jobId: job.id, status: remote.status })
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id")
      .eq("slug", "4bid")
      .single()
    if (propertyError || !property) throw new Error(propertyError?.message || "Tenant 4BID non trovato")

    const input = {
      brief: BRIEF,
      aspectRatio: "16:9" as const,
      durationSeconds: 30,
      resolution: "720p" as const,
      generateAudio: false,
    }
    const plan = await directVideo(input)

    const { data: job, error: insertError } = await supabase
      .from("ai_video_jobs")
      .insert({
        property_id: property.id,
        brief: BRIEF,
        aspect_ratio: input.aspectRatio,
        duration_seconds: input.durationSeconds,
        resolution: input.resolution,
        generate_audio: input.generateAudio,
        title: plan.title,
        master_prompt: plan.master_prompt,
        storyboard: plan.scenes,
        status: "planning",
      })
      .select("id")
      .single()
    if (insertError || !job) throw new Error(insertError?.message || "Impossibile creare il job")

    try {
      const provider = await createBytePlusVideoTask({
        prompt: plan.master_prompt,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
      })
      await supabase
        .from("ai_video_jobs")
        .update({ status: "queued", provider_task_id: provider.id, provider_response: provider.raw, updated_at: new Date().toISOString() })
        .eq("id", job.id)
      return NextResponse.json({ jobId: job.id, status: "queued", title: plan.title })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore generazione"
      await supabase
        .from("ai_video_jobs")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", job.id)
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
