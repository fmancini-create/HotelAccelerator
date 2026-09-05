import { redirect } from "next/navigation"

export default function CrmSegmentsPage() {
  redirect("/admin/crm?tab=segments")
}
