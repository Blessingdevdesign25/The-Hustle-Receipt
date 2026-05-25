import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { initiatePayment } from "@/lib/flutterwave"
import { generateTxRef } from "@/lib/utils"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { creatorSlug, tipperName, tipperEmail, amount, message } = body

    if (!creatorSlug || !tipperEmail || !amount) {
      return NextResponse.json(
        { error: "creatorSlug, tipperEmail, and amount are required" },
        { status: 400 }
      )
    }

    if (typeof amount !== "number" || amount < 100) {
      return NextResponse.json(
        { error: "Amount must be at least 100 NGN" },
        { status: 400 }
      )
    }

    const creator = await prisma.user.findUnique({
      where: { slug: creatorSlug },
    })

    if (!creator) {
      return NextResponse.json(
        { error: "Creator not found" },
        { status: 404 }
      )
    }

    const txRef = generateTxRef()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    const redirectUrl = `${baseUrl}/tip/${creatorSlug}/success`

    await prisma.tip.create({
      data: {
        creatorId: creator.id,
        tipperName: tipperName || null,
        tipperEmail,
        amount,
        message: message || null,
        txRef,
        status: "PENDING",
      },
    })

    const checkoutUrl = await initiatePayment({
      txRef,
      amount,
      email: tipperEmail,
      name: tipperName || "Anonymous",
      redirectUrl,
      title: `Tip for ${creator.displayName}`,
      description: message || `Support ${creator.displayName}`,
      meta: { creatorId: creator.id, message: message || "" },
    })

    return NextResponse.json({ checkoutUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate payment"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
