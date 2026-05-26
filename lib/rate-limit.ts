const store = new Map<string, number[]>()

const WINDOW_MS = 60_000
const MAX_REQUESTS = 10

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  let timestamps = store.get(key)

  if (!timestamps) {
    timestamps = []
    store.set(key, timestamps)
  }

  const valid = timestamps.filter((t) => t > windowStart)
  valid.push(now)
  store.set(key, valid)

  if (valid.length > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: MAX_REQUESTS - valid.length }
}
