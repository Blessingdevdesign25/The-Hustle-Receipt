import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ transaction_id?: string; tx_ref?: string }>
}) {
  const { transaction_id, tx_ref } = await searchParams

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-600/10 text-3xl text-green-600">
        ✓
      </div>
      <h1 className="text-2xl font-bold">Payment successful!</h1>
      <p className="mt-2 text-sm text-foreground/50">
        Your payment has been processed successfully.
      </p>

      <div className="mt-8 w-full rounded-xl border border-foreground/10 bg-background p-6 text-left">
        {transaction_id && (
          <div className="flex justify-between text-sm">
            <dt className="text-foreground/50">Transaction ID</dt>
            <dd className="font-mono text-xs font-medium">{transaction_id}</dd>
          </div>
        )}
        {tx_ref && (
          <div className="mt-3 flex justify-between text-sm">
            <dt className="text-foreground/50">Reference</dt>
            <dd className="font-mono text-xs font-medium">{tx_ref}</dd>
          </div>
        )}
      </div>

      <Link
        href="/"
        className="mt-8 rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90"
      >
        Go home
      </Link>
      <p className="mt-6 text-xs text-foreground/50">
        Powered by The Hustle Receipt &amp; Flutterwave
      </p>
    </div>
  )
}
