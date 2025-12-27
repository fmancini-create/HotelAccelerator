import { NextResponse } from "next/server"

// Test endpoint to verify Pub/Sub configuration
export async function GET() {
  const envCheck = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
    GOOGLE_PUBSUB_TOPIC: process.env.GOOGLE_PUBSUB_TOPIC || "NOT SET",
    webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/webhook/gmail`,
  }

  console.log("[v0] Webhook test - Environment check:", envCheck)

  return NextResponse.json({
    status: "ok",
    message: "Use these values to configure Google Cloud Pub/Sub",
    config: envCheck,
    instructions: [
      "1. Go to Google Cloud Console > Pub/Sub > Topics",
      "2. Find or create topic matching GOOGLE_PUBSUB_TOPIC",
      "3. Create a Push Subscription with endpoint URL: " + envCheck.webhookUrl,
      "4. Grant gmail-api-push@system.gserviceaccount.com permission to publish to the topic",
      "5. Enable push notifications on /admin/channels/email",
    ],
  })
}

// Simulate a Pub/Sub message for testing
export async function POST() {
  const testPayload = {
    message: {
      data: Buffer.from(
        JSON.stringify({
          emailAddress: "info@ibarronci.com",
          historyId: "99999999",
        }),
      ).toString("base64"),
      messageId: "test-" + Date.now(),
    },
  }

  console.log("[v0] Sending test webhook payload:", testPayload)

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/webhook/gmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    })

    const result = await response.json()
    return NextResponse.json({
      status: "test_sent",
      response: result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: String(error),
      },
      { status: 500 },
    )
  }
}
