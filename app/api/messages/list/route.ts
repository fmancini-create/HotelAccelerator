import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const newUrl = new URL("/api/inbox/conversations", request.url)
  newUrl.search = searchParams.toString()
  return NextResponse.redirect(newUrl)
}
