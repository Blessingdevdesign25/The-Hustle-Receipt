interface WallMessage {
  id: string
  tipperName: string | null
  message: string
  amount: number
}

export function MessageWall({ messages }: { messages: WallMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm text-zinc-500">No messages yet. Tips with messages will appear here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {messages.slice(0, 10).map((msg) => (
        <div key={msg.id} className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{msg.tipperName || "Anonymous"}</span>
            <span className="text-xs font-medium text-zinc-500">₦{msg.amount.toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm italic text-zinc-600">&ldquo;{msg.message}&rdquo;</p>
        </div>
      ))}
    </div>
  )
}
