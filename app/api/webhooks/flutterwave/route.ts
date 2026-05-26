import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const hash = request.headers.get("verif-hash")
    const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET

    if (webhookSecret && hash !== webhookSecret) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
    }

    const event = await request.json()

    if (event.event !== "charge.completed" && event.event !== "transfer.completed") {
      return NextResponse.json({ status: "ignored" })
    }

    const txRef = event.data?.tx_ref
    const flwId = event.data?.id
    const status = event.data?.status
    const currency = event.data?.currency
    const chargedAmount = event.data?.charged_amount

    if (!txRef || !flwId) {
      return NextResponse.json({ error: "Missing tx_ref or id" }, { status: 400 })
    }

    const tip = await prisma.tip.findUnique({ where: { txRef } })
    if (!tip) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    if (tip.status !== "PENDING") {
      return NextResponse.json({ status: "already_processed" })
    }

    if (
      status === "successful" &&
      currency === "NGN" &&
      chargedAmount >= tip.amount
    ) {
      await prisma.tip.update({
        where: { id: tip.id },
        data: {
          flutterwaveTransactionId: String(flwId),
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      })
    } else {
      await prisma.tip.update({
        where: { id: tip.id },
        data: {
          flutterwaveTransactionId: String(flwId),
          status: "FAILED",
        },
      })
    }

    return NextResponse.json({ status: "processed" })
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
