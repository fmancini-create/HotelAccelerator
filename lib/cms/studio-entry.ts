export type CMSStudioProjectEntry = {
  has_builder_draft?: boolean | null
} | null | undefined

export function shouldResumeBuilder(project: CMSStudioProjectEntry, search = "") {
  if (!project?.has_builder_draft) return false
  return new URLSearchParams(search).get("setup") !== "1"
}
