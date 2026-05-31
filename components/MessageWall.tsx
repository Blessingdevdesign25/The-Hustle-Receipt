interface WallMessage {
  id: string
  tipperName: string | null
  message: string
  amount: number
}

export function MessageWall({ messages }: { messages: WallMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-foreground/10 bg-background p-8 text-center">
        <p className="text-sm text-foreground/50">No messages yet. Tips with messages will appear here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {messages.slice(0, 10).map((msg) => (
        <div key={msg.id} className="rounded-xl border border-foreground/10 bg-background p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{msg.tipperName || "Anonymous"}</span>
            <span className="text-xs font-medium text-foreground/50">₦{msg.amount.toLocaleString()}</span>
          </div>
          <p className="mt-2 text-sm italic text-foreground/70">&ldquo;{msg.message}&rdquo;</p>
        </div>
      ))}
    </div>
  )
}
