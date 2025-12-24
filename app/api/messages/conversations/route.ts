import { NextResponse } from "next/server"

export async function GET(request: Request) {
  // Redirect alla nuova route
  const { searchParams } = new URL(request.url)
  const newUrl = new URL("/api/inbox/conversations", request.url)
  newUrl.search = searchParams.toString()
  return NextResponse.redirect(newUrl)
}

export async function POST(request: Request) {
  return NextResponse.redirect(new URL("/api/inbox/conversations", request.url))
}
