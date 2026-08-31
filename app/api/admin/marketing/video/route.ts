import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { z } from "zod"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { directVideo } from "@/lib/marketing/video-director"
import { createBytePlusVideoTask, getBytePlusVideoTask } from "@/lib/integrations/byteplus/video"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const createSchema = z.object({
  brief: z.string().trim().min(20).max(6000),
  aspectRatio: z.enum(["16:9", "9:16"]).default("16:9"),
  durationSeconds: z.number().int().min(4).max(30).default(30),
  resolution: z.enum(["720p", "1080p"]).default("1080p"),
  generateAudio: z.boolean().default(false),
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function persistOutput(propertyId: string, jobId: string, providerUrl: string): Promise<string> {
  try {
    const response = await fetch(providerUrl, { cache: "no-store" })
    if (!response.ok || !response.body) return providerUrl
    const blob = await put(`ai-video/${propertyId}/${jobId}.mp4`, response.body, {
      access: "public",
      contentType: response.headers.get("content-type") || "video/mp4",
      addRandomSuffix: false,
    })
    return blob.url
  } catch (error) {
    console.error("[ai-video] durable copy failed", { jobId, error })
    return providerUrl
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const identity = await getCallerIdentity(request)
    const input = createSchema.parse(await request.json())
    const supabase = createServiceClient()

    const { data: job, error: insertError } = await supabase
      .from("ai_video_jobs")
      .insert({
        property_id: propertyId,
        created_by: identity?.adminUserId ?? null,
        brief: input.brief,
        aspect_ratio: input.aspectRatio,
        duration_seconds: input.durationSeconds,
        resolution: input.resolution,
        generate_audio: input.generateAudio,
        status: "planning",
      })
      .select("id")
      .single()

    if (insertError || !job) throw new Error(insertError?.message || "Impossibile creare il job video")

    try {
      const plan = await directVideo(input)
      const provider = await createBytePlusVideoTask({
        prompt: plan.master_prompt,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
      })

      const { error: updateError } = await supabase
        .from("ai_video_jobs")
        .update({
          title: plan.title,
          master_prompt: plan.master_prompt,
          storyboard: plan.scenes,
          provider_task_id: provider.id,
          provider_response: provider.raw,
          status: "queued",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("property_id", propertyId)
      if (updateError) throw new Error(updateError.message)

      return NextResponse.json({ id: job.id, status: "queued", title: plan.title, storyboard: plan.scenes })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore generazione video"
      await supabase
        .from("ai_video_jobs")
        .update({ status: "failed", error_message: message, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("property_id", propertyId)
      throw error
    }
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Parametri video non validi" }, { status: 400 })
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const id = request.nextUrl.searchParams.get("id")

    if (!id) {
      const { data, error } = await supabase
        .from("ai_video_jobs")
        .select("id,title,status,aspect_ratio,duration_seconds,resolution,output_url,error_message,created_at")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false })
        .limit(12)
      if (error) throw new Error(error.message)
      return NextResponse.json({ jobs: data ?? [] })
    }

    if (!UUID.test(id)) return NextResponse.json({ error: "Job non valido" }, { status: 400 })

    const { data: job, error } = await supabase
      .from("ai_video_jobs")
      .select("*")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!job) return NextResponse.json({ error: "Video non trovato" }, { status: 404 })

    if (job.provider_task_id && ["queued", "running"].includes(job.status)) {
      const remote = await getBytePlusVideoTask(job.provider_task_id)
      const now = new Date().toISOString()
      if (remote.status === "succeeded" && remote.content?.video_url) {
        const outputUrl = await persistOutput(propertyId, job.id, remote.content.video_url)
        const { data: updated, error: updateError } = await supabase
          .from("ai_video_jobs")
          .update({
            status: "succeeded",
            output_url: outputUrl,
            provider_response: remote,
            completed_at: now,
            updated_at: now,
          })
          .eq("id", job.id)
          .eq("property_id", propertyId)
          .select("*")
          .single()
        if (updateError) throw new Error(updateError.message)
        return NextResponse.json({ job: updated })
      }

      if (["failed", "expired", "cancelled"].includes(remote.status)) {
        const message = remote.error?.message || `Generazione ${remote.status}`
        const status = remote.status === "cancelled" ? "cancelled" : "failed"
        const { data: updated } = await supabase
          .from("ai_video_jobs")
          .update({ status, error_message: message, provider_response: remote, completed_at: now, updated_at: now })
          .eq("id", job.id)
          .eq("property_id", propertyId)
          .select("*")
          .single()
        return NextResponse.json({ job: updated ?? { ...job, status, error_message: message } })
      }

      if (remote.status !== job.status) {
        const { data: updated } = await supabase
          .from("ai_video_jobs")
          .update({ status: remote.status, provider_response: remote, updated_at: now })
          .eq("id", job.id)
          .eq("property_id", propertyId)
          .select("*")
          .single()
        return NextResponse.json({ job: updated ?? { ...job, status: remote.status } })
      }
    }

    return NextResponse.json({ job })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
