interface RecentTip {
  id: string
  amount: number
  tipperName: string | null
  message: string | null
  createdAt: string
}

export function RecentTips({ tips }: { tips: RecentTip[] }) {
  if (tips.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm text-zinc-400">No tips yet. Share your tip page to get started!</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50">
            <th className="px-4 py-3 text-left font-medium text-zinc-500">From</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500">Amount</th>
            <th className="px-4 py-3 text-left font-medium text-zinc-500 hidden sm:table-cell">Message</th>
            <th className="px-4 py-3 text-right font-medium text-zinc-500">Date</th>
          </tr>
        </thead>
        <tbody>
          {tips.map((tip) => (
            <tr key={tip.id} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-3 font-medium">{tip.tipperName || "Anonymous"}</td>
              <td className="px-4 py-3">₦{tip.amount.toLocaleString()}</td>
              <td className="hidden max-w-[200px] truncate px-4 py-3 text-zinc-500 sm:table-cell">
                {tip.message || "—"}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {new Date(tip.createdAt).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
