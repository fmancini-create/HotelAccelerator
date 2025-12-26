import { NextResponse } from "next/server"
import { MessageRuleService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: Request) {
  try {
    const rules = await MessageRuleService.listRules(request)
    return NextResponse.json({ rules })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rule = await MessageRuleService.createRule(request, body)
    return NextResponse.json({ rule }, { status: 201 })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
