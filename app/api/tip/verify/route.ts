import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyTransaction } from "@/lib/flutterwave"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transaction_id")
    const slug = searchParams.get("slug")

    if (!transactionId || !slug) {
      return NextResponse.json(
        { verified: false, error: "transaction_id and slug are required" },
        { status: 400 }
      )
    }

    const existing = await prisma.tip.findUnique({
      where: { flutterwaveTransactionId: transactionId },
    })

    if (existing) {
      return NextResponse.json({
        verified: true,
        tip: {
          amount: existing.amount,
          currency: existing.currency,
          tipperName: existing.tipperName,
          message: existing.message,
          createdAt: existing.createdAt.toISOString(),
        },
      })
    }

    const transaction = await verifyTransaction(transactionId)

    if (transaction.status !== "successful") {
      return NextResponse.json(
        { verified: false, error: "Payment not successful" },
        { status: 400 }
      )
    }

    if (transaction.currency !== "NGN") {
      return NextResponse.json(
        { verified: false, error: "Invalid currency" },
        { status: 400 }
      )
    }

    const tipRecord = await prisma.tip.findUnique({
      where: { txRef: transaction.tx_ref },
    })

    if (!tipRecord) {
      return NextResponse.json(
        { verified: false, error: "Transaction not found" },
        { status: 404 }
      )
    }

    if (transaction.amount < tipRecord.amount) {
      return NextResponse.json(
        { verified: false, error: "Amount mismatch" },
        { status: 400 }
      )
    }

    const updated = await prisma.tip.update({
      where: { id: tipRecord.id },
      data: {
        flutterwaveTransactionId: String(transaction.id),
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    })

    return NextResponse.json({
      verified: true,
      tip: {
        amount: updated.amount,
        currency: updated.currency,
        tipperName: updated.tipperName,
        message: updated.message,
        createdAt: updated.createdAt.toISOString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed"
    return NextResponse.json({ verified: false, error: message }, { status: 500 })
  }
}
