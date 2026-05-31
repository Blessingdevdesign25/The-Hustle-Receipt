export function DashboardStats({
  totalAmount,
  tipCount,
}: {
  totalAmount: number
  tipCount: number
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-xl border border-foreground/10 bg-background p-4">
        <p className="text-xs uppercase tracking-wider text-foreground/50">Total received</p>
        <p className="mt-1 text-2xl font-bold">₦{totalAmount.toLocaleString()}</p>
      </div>
      <div className="rounded-xl border border-foreground/10 bg-background p-4">
        <p className="text-xs uppercase tracking-wider text-foreground/50">Total tips</p>
        <p className="mt-1 text-2xl font-bold">{tipCount}</p>
      </div>
    </div>
  )
}
