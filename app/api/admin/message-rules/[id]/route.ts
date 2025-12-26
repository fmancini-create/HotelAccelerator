import { NextResponse } from "next/server"
import { MessageRuleService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const rule = await MessageRuleService.getRule(request, id)
    return NextResponse.json({ rule })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const rule = await MessageRuleService.updateRule(request, id, body)
    return NextResponse.json({ rule })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { is_active } = body

    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const rule = await MessageRuleService.toggleRuleActive(request, id, is_active)
    return NextResponse.json({ rule })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    await MessageRuleService.deleteRule(request, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
