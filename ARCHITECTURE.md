# Architecture

This document covers the full request/response flow, every route, and the contracts between components.

---

## Routes

### Public routes

| Route | Component | Description |
|---|---|---|
| `/` | `app/page.tsx` | Landing / redirect to login |
| `/login` | `app/(auth)/login/page.tsx` | Creator login form |
| `/signup` | `app/(auth)/signup/page.tsx` | Creator registration |
| `/tip/[slug]` | `app/tip/[slug]/page.tsx` | Public tip page — no auth |
| `/tip/[slug]/success` | `app/tip/[slug]/success/page.tsx` | Post-payment receipt page |

### Protected routes

| Route | Component | Guard |
|---|---|---|
| `/dashboard` | `app/dashboard/page.tsx` | NextAuth session check → redirect to /login |

### API routes

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/tip/initiate` | None | Receives tip form data, calls FLW, returns `{ checkout_url }` |
| GET | `/api/tip/verify` | None | Verifies FLW transaction_id, saves tip to DB |
| GET | `/api/dashboard` | Required | Returns `{ totalAmount, tipCount, recentTips[], messages[] }` |

---

## Payment flow (detailed)

```
Fan fills form
  → POST /api/tip/initiate
      body: { creatorSlug, tipperName?, tipperEmail, amount, message? }
      server: looks up creator by slug, builds FLW payload
      server: POST https://api.flutterwave.com/v3/payments
      response: { checkout_url: "https://checkout.flutterwave.com/v3/hosted/pay/..." }
  → Client redirects fan to checkout_url

Fan completes payment on Flutterwave
  → FLW redirects to /tip/[slug]/success?transaction_id=FLW-XXXX&status=successful

Success page loads
  → calls GET /api/tip/verify?transaction_id=FLW-XXXX&slug=[slug]
      server: GET https://api.flutterwave.com/v3/transactions/{id}/verify
              (uses FLWSECK_TEST secret key — server-side only)
      checks: status === "successful"
      checks: amount matches what was initiated
      checks: currency === "NGN"
      if valid: prisma.tip.create(...)
      response: { verified: true, tip: { amount, tipperName, message } }
  → Page shows receipt UI
```

---

## API contracts

### POST /api/tip/initiate

**Request body**
```ts
{
  creatorSlug: string       // used to look up creator + build redirect URL
  tipperName?: string       // optional, shown on receipt and dashboard
  tipperEmail: string       // required by Flutterwave
  amount: number            // in Naira (NGN) — e.g. 500
  message?: string          // optional message for the wall
}
```

**Success response**
```ts
{
  checkoutUrl: string       // Flutterwave hosted payment page
}
```

**FLW payload sent internally**
```ts
{
  tx_ref: `tip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  amount: number,
  currency: "NGN",
  redirect_url: `${BASE_URL}/tip/${slug}/success`,
  customer: { email, name },
  customizations: {
    title: `Tip ${creator.displayName}`,
    description: message || `Support ${creator.displayName}`,
    logo: creator.avatarUrl || ""
  },
  meta: { creatorId: creator.id, message }
}
```

---

### GET /api/tip/verify

**Query params:** `transaction_id`, `slug`

**Success response**
```ts
{
  verified: boolean
  tip?: {
    amount: number
    currency: string
    tipperName: string
    message: string
    createdAt: string
  }
}
```

**Failure response**
```ts
{
  verified: false
  error: "Transaction not found" | "Amount mismatch" | "Payment not successful"
}
```

---

### GET /api/dashboard

**Auth:** NextAuth session required (returns 401 if missing)

**Response**
```ts
{
  totalAmount: number         // sum of all verified tips for this creator
  tipCount: number
  recentTips: Array<{
    id: string
    amount: number
    tipperName: string | null
    message: string | null
    createdAt: string
  }>
  messages: Array<{           // all tips that have a message — for the wall
    id: string
    tipperName: string | null
    message: string
    amount: number
  }>
}
```

---

## React Query setup on dashboard

```ts
// app/dashboard/page.tsx (simplified)
const { data, isLoading } = useQuery({
  queryKey: ['dashboard'],
  queryFn: () => fetch('/api/dashboard').then(r => r.json()),
  staleTime: 5 * 60 * 1000,        // 5 minutes
  refetchOnWindowFocus: true,       // background revalidation on tab switch
})
```

`QueryClientProvider` wraps the app in `app/providers.tsx` — this is the standard pattern for React Query in App Router (must be a client component boundary).

---

## Security considerations

- **Never trust the client-side success redirect.** Flutterwave appends `?status=successful` to the redirect URL — this can be faked. Always verify server-side.
- **Secret key is server-only.** `FLWSECK_TEST` is used only in `/api/tip/verify` and `/api/tip/initiate`. It must never appear in client bundle. Prefix with `NEXT_PUBLIC_` only the public key.
- **Amount verification.** Store the intended amount in the `tx_ref` or in a pending `TipAttempt` record. When verifying, compare `verifiedAmount >= intendedAmount`.
- **Idempotency.** Check if `flutterwaveTransactionId` already exists in DB before saving — prevents double-saving if user refreshes the success page.
