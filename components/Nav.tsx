"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"

export function Nav() {
  const { data: session } = useSession()

  return (
    <header className="border-b border-foreground/10 bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
          The Hustle Receipt
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link href="/dashboard" className="font-medium text-foreground/80 hover:text-foreground">
                Dashboard
              </Link>
              <button
                onClick={() => signOut()}
                className="rounded-lg bg-foreground px-3 py-1.5 text-background hover:opacity-90"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-medium text-foreground/80 hover:text-foreground">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-foreground px-3 py-1.5 text-background hover:opacity-90"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
