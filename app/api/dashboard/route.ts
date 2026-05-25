import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const creatorId = session.user.id

  const [aggregate, recentTips] = await Promise.all([
    prisma.tip.aggregate({
      where: { creatorId, status: "VERIFIED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.tip.findMany({
      where: { creatorId, status: "VERIFIED" },
      orderBy: { verifiedAt: "desc" },
      take: 20,
      select: {
        id: true,
        amount: true,
        tipperName: true,
        message: true,
        verifiedAt: true,
        createdAt: true,
      },
    }),
  ])

  const messages = recentTips
    .filter((t) => t.message)
    .map((t) => ({
      id: t.id,
      tipperName: t.tipperName,
      message: t.message!,
      amount: t.amount,
    }))

  return NextResponse.json({
    totalAmount: aggregate._sum.amount || 0,
    tipCount: aggregate._count,
    recentTips: recentTips.map((t) => ({
      id: t.id,
      amount: t.amount,
      tipperName: t.tipperName,
      message: t.message,
      createdAt: (t.verifiedAt || t.createdAt).toISOString(),
    })),
    messages,
  })
}
