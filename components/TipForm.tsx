"use client"

import { useState } from "react"

export function TipForm({
  creatorSlug,
  creatorName,
}: {
  creatorSlug: string
  creatorName: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const presetAmounts = [500, 1000, 2000, 5000]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const numAmount = Number(amount)
    if (!numAmount || numAmount < 100) {
      setError("Amount must be at least 100 NGN")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/tip/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorSlug,
          tipperName: name || undefined,
          tipperEmail: email,
          amount: numAmount,
          message: message || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to initiate payment")
        setLoading(false)
        return
      }

      window.location.href = data.checkoutUrl
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground/80">
          Your name <span className="text-foreground/50">(optional)</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Anonymous"
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground/80">
          Your email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none"
          required
        />
      </div>

      <div>
        <label htmlFor="amount" className="mb-1 block text-sm font-medium text-foreground/80">
          Amount (NGN)
        </label>
        <input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          min={100}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none"
          required
        />
        <div className="mt-2 flex gap-2">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                Number(amount) === preset
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/20 text-foreground/70 hover:border-foreground/40"
              }`}
            >
              ₦{preset.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="message" className="mb-1 block text-sm font-medium text-foreground/80">
          Message <span className="text-foreground/50">(optional)</span>
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Say something nice to ${creatorName}...`}
          rows={3}
          className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm focus:border-foreground focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-foreground py-3 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Redirecting to payment..." : `Send ₦${Number(amount) ? Number(amount).toLocaleString() : "..."}`}
      </button>
    </form>
  )
}
