# Flutterwave Integration

Everything you need to get real payments working — what to grab, where to put it, and how every API call works.

---

## What you need to get from Flutterwave

### 1. Create a Flutterwave account
Go to: **https://dashboard.flutterwave.com/signup**

Use a real email address. You don't need to verify a business immediately — test mode works with just a personal account.

### 2. Get your test API keys
After logging in:
1. Go to **Settings → API Keys**
2. Make sure you're in **Test Mode** (toggle in the top-right of the dashboard)
3. Copy both keys:

| Key name | Env variable | Used where |
|---|---|---|
| Public key | `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | Inline JS SDK (client, if using that method) |
| Secret key | `FLUTTERWAVE_SECRET_KEY` | Server-side API calls **only** — never in client code |

Test keys look like:
- `FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X`
- `FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X`

### 3. Set your redirect URL (optional but clean)
In **Settings → API → Redirect URL**, you can set a default redirect. For this project you'll pass `redirect_url` per transaction, so this isn't strictly required.

---

## Which integration method this project uses

**Flutterwave Standard** (server-side initiation, hosted checkout).

Flow:
1. Your server POSTs to `https://api.flutterwave.com/v3/payments` with the secret key
2. Flutterwave returns a `{ link: "https://checkout.flutterwave.com/..." }` URL
3. You redirect the fan's browser to that URL
4. Fan pays on Flutterwave's hosted page
5. Flutterwave redirects back to your `redirect_url` with `?transaction_id=...&status=successful`
6. Your server verifies the transaction with the secret key

This is the most secure approach — the secret key never touches the browser.

---

## Initiation: POST /v3/payments

```ts
// lib/flutterwave.ts

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!
const FLW_BASE   = "https://api.flutterwave.com/v3"

export async function initiatePayment(payload: {
  txRef: string
  amount: number
  email: string
  name: string
  redirectUrl: string
  title: string
  description: string
  meta?: Record<string, unknown>
}) {
  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FLW_SECRET}`,
    },
    body: JSON.stringify({
      tx_ref:       payload.txRef,
      amount:       payload.amount,
      currency:     "NGN",
      redirect_url: payload.redirectUrl,
      customer: {
        email: payload.email,
        name:  payload.name,
      },
      customizations: {
        title:       payload.title,
        description: payload.description,
      },
      meta: payload.meta,
    }),
  })

  const data = await res.json()

  if (data.status !== "success") {
    throw new Error(data.message || "Failed to initiate payment")
  }

  return data.data.link as string   // the hosted checkout URL
}
```

**Response shape from Flutterwave:**
```json
{
  "status": "success",
  "message": "Hosted Link",
  "data": {
    "link": "https://checkout.flutterwave.com/v3/hosted/pay/abc123xyz"
  }
}
```

---

## Verification: GET /v3/transactions/{id}/verify

After Flutterwave redirects the fan to `/tip/[slug]/success?transaction_id=12345&status=successful`, your server must verify independently.

```ts
export async function verifyTransaction(transactionId: string) {
  const res = await fetch(
    `${FLW_BASE}/transactions/${transactionId}/verify`,
    {
      headers: {
        Authorization: `Bearer ${FLW_SECRET}`,
      },
    }
  )

  const data = await res.json()

  if (data.status !== "success") {
    throw new Error("Verification failed: " + data.message)
  }

  return data.data as FlwTransaction
}
```

**Verification response shape (relevant fields):**
```ts
interface FlwTransaction {
  id: number
  tx_ref: string              // matches what you sent
  flw_ref: string             // Flutterwave's internal ref
  amount: number              // what was actually charged
  charged_amount: number
  currency: string            // "NGN"
  status: string              // "successful" | "failed" | "pending"
  payment_type: string        // "card" | "banktransfer" | "ussd" etc.
  customer: {
    id: number
    name: string
    email: string
  }
  meta: {
    creatorId: string
    message?: string
  }
}
```

**Verification checklist** — validate ALL of these before saving:
```ts
const verified =
  transaction.status === "successful" &&
  transaction.currency === "NGN" &&
  transaction.amount >= expectedAmount &&   // ← pull expectedAmount from DB by tx_ref
  transaction.tx_ref === txRef              // ← confirms this isn't a replay
```

---

## The success redirect URL

Flutterwave appends these query params:
```
/tip/[slug]/success
  ?transaction_id=1234567
  &tx_ref=tip-1719000000-abc123
  &status=successful
```

Read them in the success page:
```ts
// app/tip/[slug]/success/page.tsx
export default async function SuccessPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { transaction_id?: string; status?: string; tx_ref?: string }
}) {
  const { transaction_id, status } = searchParams

  if (status !== "successful" || !transaction_id) {
    // show failed state
  }

  // call your own verify endpoint (server-to-server)
  const result = await verifyAndSaveTip(transaction_id, params.slug)
  // render receipt
}
```

---

## Test cards (for development)

Use these on the Flutterwave test checkout — no real money moves.

| Card number | CVV | Expiry | PIN | OTP | Result |
|---|---|---|---|---|---|
| 5531 8866 5214 2950 | 564 | 09/32 | 3310 | 12345 | Successful |
| 4187 4274 1556 4246 | 828 | 09/32 | 3310 | 12345 | Successful |
| 5258 5859 2266 6506 | 883 | 09/32 | 3310 | 12345 | Insufficient funds |

For bank transfer tests, Flutterwave provides test account numbers in the checkout flow automatically.

---

## Webhook (optional enhancement)

Flutterwave also supports webhooks — they POST to your server when a transaction completes. This is more reliable than redirect-based verification (covers cases where the user closes the browser before being redirected).

To add:
1. In Flutterwave dashboard → **Settings → Webhooks**, add `https://your-domain.com/api/webhooks/flutterwave`
2. Add a `FLUTTERWAVE_WEBHOOK_SECRET` env var (set in dashboard)
3. Verify the `verif-hash` header on each incoming request

For this capstone, redirect-based verification is sufficient. Webhooks are the production upgrade.
