/**
 * Security headers for API responses
 * Apply these to all API routes for defense-in-depth
 */
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

/**
 * Content Security Policy for HTML responses
 */
export const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.vercel-scripts.com https://*.googletagmanager.com https://*.google-analytics.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' blob: data: https://*.blob.vercel-storage.com https://*.googleusercontent.com https://*.public.blob.vercel-storage.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vercel-analytics.com https://*.google-analytics.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\s+/g, " ")
  .trim()

/**
 * Helper to add security headers to a Response
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)

  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value)
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
