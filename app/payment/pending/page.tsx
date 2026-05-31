import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function PaymentPendingPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/10 text-3xl text-blue-600">
        ⏳
      </div>
      <h1 className="text-xl font-bold">Payment pending</h1>
      <p className="mt-2 text-sm text-foreground/50">
        Your payment is being processed. This page will update automatically
        once the transaction is confirmed.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90"
      >
        Go home
      </Link>
      <p className="mt-4 text-xs text-foreground/50">
        Powered by The Hustle Receipt &amp; Flutterwave
      </p>
    </div>
  )
}
