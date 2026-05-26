import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { TipForm } from "@/components/TipForm"
import type { Metadata } from "next"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  let creator = await prisma.user.findUnique({ where: { slug } })

  if (!creator) {
    creator = await prisma.user.findFirst({
      where: { slug: { startsWith: slug + "-" } },
      orderBy: { createdAt: "desc" },
    })
  }

  if (!creator) return { title: "Creator not found" }

  return {
    title: `Tip ${creator.displayName} | The Hustle Receipt`,
    description: creator.bio || `Support ${creator.displayName} with a tip`,
    openGraph: {
      title: `Tip ${creator.displayName} on The Hustle Receipt`,
      description: creator.bio || `Support ${creator.displayName} with a tip`,
    },
  }
}

export default async function TipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let creator = await prisma.user.findUnique({ where: { slug } })

  if (!creator) {
    creator = await prisma.user.findFirst({
      where: { slug: { startsWith: slug + "-" } },
      orderBy: { createdAt: "desc" },
    })
  }

  if (!creator) notFound()

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="mb-2 h-16 w-16 rounded-full bg-zinc-200 flex items-center justify-center text-2xl font-bold text-zinc-500">
        {creator.displayName.charAt(0).toUpperCase()}
      </div>
      <h1 className="text-2xl font-bold">{creator.displayName}</h1>
      {creator.bio && <p className="mt-1 text-sm text-zinc-500">{creator.bio}</p>}
      <p className="mt-1 text-xs text-zinc-400">@{creator.slug}</p>

      <div className="mt-8 w-full">
        <TipForm creatorSlug={creator.slug} creatorName={creator.displayName} />
      </div>
    </div>
  )
}
