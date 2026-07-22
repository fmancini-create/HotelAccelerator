import type React from "react"

interface PageHeaderProps {
  title: string
  description?: string
  showBack?: boolean
  showHome?: boolean
  homeUrl?: string
  children?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  children,
}: PageHeaderProps) {
  // Navigation is now handled by the main app-header
  // This component only shows the page title and optional actions
  return (
    <div className="border-b bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {children && <div className="flex items-center gap-4">{children}</div>}
      </div>
    </div>
  )
}
