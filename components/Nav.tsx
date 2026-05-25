"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"

export function Nav() {
  const { data: session } = useSession()

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          The Hustle Receipt
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link href="/dashboard" className="font-medium text-zinc-700 hover:text-zinc-900">
                Dashboard
              </Link>
              <button
                onClick={() => signOut()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="font-medium text-zinc-700 hover:text-zinc-900">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white hover:bg-zinc-800"
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
