import Link from "next/link"

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl text-foreground">
        The Hustle Receipt
      </h1>
      <p className="mt-4 max-w-md text-lg text-foreground/70">
        A page a creator can share. A way fans can tip. A verified receipt at the end.
      </p>

      <div className="mt-10 flex gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background hover:opacity-90"
        >
          Start receiving tips
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-foreground/20 px-6 py-3 text-sm font-semibold text-foreground/80 hover:bg-foreground/5"
        >
          Sign in
        </Link>
      </div>

      <div className="mt-24 grid gap-8 sm:grid-cols-3">
        <div className="rounded-xl border border-foreground/10 bg-background p-6 text-left">
          <div className="mb-3 text-2xl">🔗</div>
          <h3 className="font-semibold text-foreground">Share your link</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Get a public page at /tip/your-name. Share it anywhere.
          </p>
        </div>
        <div className="rounded-xl border border-foreground/10 bg-background p-6 text-left">
          <div className="mb-3 text-2xl">💸</div>
          <h3 className="font-semibold text-foreground">Receive tips</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Fans send you money via Flutterwave. Real payments, real Naira.
          </p>
        </div>
        <div className="rounded-xl border border-foreground/10 bg-background p-6 text-left">
          <div className="mb-3 text-2xl">📊</div>
          <h3 className="font-semibold text-foreground">Track everything</h3>
          <p className="mt-1 text-sm text-foreground/70">
            Dashboard with stats, recent tips, and a message wall from your supporters.
          </p>
        </div>
      </div>
    </div>
  )
}
