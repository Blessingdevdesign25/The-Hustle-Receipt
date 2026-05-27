import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"

export default async function FailedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const creator = await prisma.user.findUnique({ where: { slug } })
  if (!creator) notFound()

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 text-5xl">✕</div>
      <h1 className="text-xl font-bold">Payment failed</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The payment did not go through. This could be due to insufficient funds,
        a declined card, or a network issue.
      </p>
      <Link
        href={`/tip/${slug}`}
        className="mt-8 rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Try again
      </Link>
      <p className="mt-4 text-xs text-zinc-500">
        Powered by The Hustle Receipt &amp; Flutterwave
      </p>
    </div>
  )
}
