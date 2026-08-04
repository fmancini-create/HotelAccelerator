import { StudioModernNavigation } from "@/components/cms/studio-modern-navigation"

export default function CMSStudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioModernNavigation>{children}</StudioModernNavigation>
}
