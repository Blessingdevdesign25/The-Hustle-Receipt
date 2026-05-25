"use client"

import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import { redirect } from "next/navigation"
import { DashboardStats } from "@/components/DashboardStats"
import { RecentTips } from "@/components/RecentTips"
import { MessageWall } from "@/components/MessageWall"

async function fetchDashboard() {
  const res = await fetch("/api/dashboard")
  if (!res.ok) throw new Error("Failed to fetch dashboard data")
  return res.json() as Promise<{
    totalAmount: number
    tipCount: number
    recentTips: Array<{
      id: string
      amount: number
      tipperName: string | null
      message: string | null
      createdAt: string
    }>
    messages: Array<{
      id: string
      tipperName: string | null
      message: string
      amount: number
    }>
  }>
}

export default function DashboardPage() {
  const { data: session, status } = useSession()

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: status === "authenticated",
  })

  if (status === "unauthenticated") {
    redirect("/login")
  }

  if (status === "loading" || isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-8 h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="h-24 animate-pulse rounded-xl bg-zinc-200" />
          <div className="h-24 animate-pulse rounded-xl bg-zinc-200" />
        </div>
        <div className="mb-8 h-64 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-48 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      {data && (
        <>
          <div className="mb-8">
            <DashboardStats
              totalAmount={data.totalAmount}
              tipCount={data.tipCount}
            />
          </div>

          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold">Recent tips</h2>
            <RecentTips tips={data.recentTips} />
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold">Message wall</h2>
            <MessageWall messages={data.messages} />
          </section>
        </>
      )}

      {data && data.tipCount === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="font-medium">Share your tip page</p>
          <p className="mt-1 text-sm text-zinc-500">
            Let your audience know they can support you.
          </p>
          <div className="mt-4 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-mono text-zinc-600">
            {typeof window !== "undefined" && `${window.location.origin}/tip/${session?.user?.name?.toLowerCase().replace(/\s+/g, "-") || "your-slug"}`}
          </div>
        </div>
      )}
    </div>
  )
}
