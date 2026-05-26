import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyTransaction } from "@/lib/flutterwave"
import { verifyPaymentSchema } from "@/lib/validation"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const raw = Object.fromEntries(searchParams)
    const parsed = verifyPaymentSchema.safeParse(raw)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input"
      return NextResponse.json(
        { verified: false, error: firstError },
        { status: 400 }
      )
    }

    const { transaction_id: transactionId } = parsed.data

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
