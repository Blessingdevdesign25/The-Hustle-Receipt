import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { verifyTransaction } from "@/lib/flutterwave"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ transaction_id?: string; status?: string; tx_ref?: string }>
}) {
  const { slug } = await params
  const { transaction_id, status } = await searchParams

  const creator = await prisma.user.findUnique({ where: { slug } })
  if (!creator) notFound()

  if (status !== "successful" || !transaction_id) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 text-4xl">😕</div>
        <h1 className="text-xl font-bold">Payment unsuccessful</h1>
        <p className="mt-2 text-sm text-zinc-500">
          The payment did not go through. Please try again.
        </p>
        <Link
          href={`/tip/${slug}`}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </Link>
      </div>
    )
  }

  let tip: { amount: number; currency: string; tipperName: string | null; message: string | null; createdAt: string } | null = null
  let error: string | null = null

  try {
    const transaction = await verifyTransaction(transaction_id)

    if (transaction.status !== "successful" || transaction.currency !== "NGN") {
      throw new Error("Payment verification failed")
    }

    const existing = await prisma.tip.findUnique({
      where: { flutterwaveTransactionId: transaction_id },
    })

    if (existing) {
      tip = {
        amount: existing.amount,
        currency: existing.currency,
        tipperName: existing.tipperName,
        message: existing.message,
        createdAt: existing.createdAt.toISOString(),
      }
    } else {
      const tipRecord = await prisma.tip.findUnique({
        where: { txRef: transaction.tx_ref },
      })

      if (!tipRecord) {
        throw new Error("Transaction reference not found")
      }

      if (transaction.amount < tipRecord.amount) {
        throw new Error("Amount mismatch")
      }

      const updated = await prisma.tip.update({
        where: { id: tipRecord.id },
        data: {
          flutterwaveTransactionId: String(transaction.id),
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      })

      tip = {
        amount: updated.amount,
        currency: updated.currency,
        tipperName: updated.tipperName,
        message: updated.message,
        createdAt: updated.createdAt.toISOString(),
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Verification failed"
  }

  if (error || !tip) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 text-4xl">😕</div>
        <h1 className="text-xl font-bold">Verification failed</h1>
        <p className="mt-2 text-sm text-zinc-500">{error || "Could not verify payment"}</p>
        <Link
          href={`/tip/${slug}`}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 text-5xl">✓</div>
      <h1 className="text-2xl font-bold">Payment confirmed!</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your tip to {creator.displayName} has been sent.
      </p>

      <div className="mt-8 w-full rounded-xl border border-zinc-200 bg-white p-6 text-left">
        <div className="border-b border-zinc-100 pb-4">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Receipt</p>
          <p className="mt-1 text-3xl font-bold">
            ₦{tip.amount.toLocaleString()}
          </p>
        </div>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">To</dt>
            <dd className="font-medium">{creator.displayName}</dd>
          </div>
          {tip.tipperName && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">From</dt>
              <dd className="font-medium">{tip.tipperName}</dd>
            </div>
          )}
          {tip.message && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">Message</dt>
              <dd className="max-w-[200px] text-right italic text-zinc-600">
                &ldquo;{tip.message}&rdquo;
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-zinc-500">Date</dt>
            <dd className="font-medium">
              {new Date(tip.createdAt).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Status</dt>
            <dd className="font-medium text-green-600">Verified ✓</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-xs text-zinc-400">
        Powered by The Hustle Receipt &amp; Flutterwave
      </p>
    </div>
  )
}
