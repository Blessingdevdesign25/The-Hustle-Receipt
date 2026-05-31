import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { initiatePayment } from "@/lib/flutterwave"
import { generateTxRef } from "@/lib/utils"
import { initiatePaymentSchema } from "@/lib/validation"
import { checkRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const { allowed, remaining } = checkRateLimit(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": "60" } }
      )
    }

    const body = await request.json()
    const parsed = initiatePaymentSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input"
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { creatorSlug, tipperName, tipperEmail, amount, message } = parsed.data

    let creator = await prisma.user.findUnique({
      where: { slug: creatorSlug },
    })

    if (!creator) {
      creator = await prisma.user.findFirst({
        where: { slug: { startsWith: creatorSlug + "-" } },
        orderBy: { createdAt: "desc" },
      })
    }

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
      title: "The Hustle Receipt",
      description: `Tip for ${creator.displayName}${message ? ` - ${message}` : ""}`,
      meta: { creatorId: creator.id, message: message || "" },
    })

    return NextResponse.json(
      { checkoutUrl },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate payment"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
