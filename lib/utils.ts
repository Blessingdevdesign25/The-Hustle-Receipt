export function generateSlug(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

export function generateTxRef(): string {
  return `tip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
