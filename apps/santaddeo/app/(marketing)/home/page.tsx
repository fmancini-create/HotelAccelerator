import { redirect } from "next/navigation"

// Redirect /home to / to avoid duplicate content
export default function HomePage() {
  redirect("/")
}
