# Payment Flow — Line-by-Line Walkthrough

This document covers four critical pieces of the payment pipeline: how a tip is
initiated, why the user is redirected to Flutterwave's checkout, how the server
verifies the transaction, and why client-side signals are never trusted alone.

---

## 1. How the payment is initiated

The flow starts inside **`components/TipForm.tsx`**, a `"use client"` component.

### `TipForm` — client side

```
line 21   async function handleSubmit(e: React.FormEvent) {
```

When the user presses *Send*, `handleSubmit` fires. It prevents the default
form submission and begins a `fetch` to **`POST /api/tip/initiate`** (line 34).

The request body carries `creatorSlug`, `tipperEmail`, `amount`, and optionally
`tipperName` and `message` (lines 38–43). These are the raw values the tipper
typed into the form.

```
line 54   window.location.href = data.checkoutUrl
```

If the API responds with a `checkoutUrl`, the browser navigates to it
immediately. That URL is a Flutterwave-hosted payment page — the user is
leaving our app and entering Flutterwave's domain.

### `POST /api/tip/initiate` — server side

The route handler in **`app/api/tip/initiate/route.ts`** does five things in
sequence:

1. **Parse and validate the body** (lines 8–23). It destructures the JSON,
   checks that `creatorSlug`, `tipperEmail`, and `amount` exist, and rejects
   amounts below 100 NGN with a 400 response. No further processing happens
   without these.

2. **Look up the creator** (lines 25–33). It queries the `users` table by
   `slug`. If no user matches, a 404 is returned — there is no point talking
   to Flutterwave for a creator that does not exist.

3. **Generate a unique transaction reference** (line 36).
   ```ts
   const txRef = generateTxRef()
   ```
   The reference is `tip-{timestamp}-{random6chars}`. This is the identifier
   we will use later to match Flutterwave's callback to our database record.
   Every tip must have a unique `txRef` — Prisma enforces this with a `@unique`
   constraint on the column.

4. **Save a PENDING tip record** (lines 40–50). Before contacting Flutterwave,
   the handler writes a row to the `tips` table with `status: "PENDING"`. This
   records our *intent*: we know the amount, the creator, and the tipper's
   email. If anything fails later, we have an audit trail.

5. **Call Flutterwave's API** (lines 52–61). The `initiatePayment` function in
   **`lib/flutterwave.ts`** sends a server-to-server `POST` to
   `https://api.flutterwave.com/v3/payments` with:
   - `tx_ref` — our unique reference
   - `amount` and `currency: "NGN"`
   - `redirect_url` — the success page URL
   - `customer.email` and `customer.name`
   - `customizations.title` and `customizations.description`
   - `meta` — arbitrary data we want back in the callback

   The Flutterwave API requires a **Bearer token** set to the **secret key**
   (`FLWSECK_TEST-...`). This token is stored in `process.env.FLUTTERWAVE_SECRET_KEY`
   and is **never exposed to the client**. The entire call happens inside the
   server's request handler.

   Flutterwave responds with a JSON object:
   ```json
   { "status": "success", "data": { "link": "https://checkout.flutterwave.com/..." } }
   ```
   If `status` is not `"success"`, an error is thrown and caught by the
   try/catch on line 64, returning a 500 to the client.

6. **Return the checkout URL** (line 63). The server responds with
   `{ checkoutUrl: "https://checkout.flutterwave.com/..." }`. The client
   receives this and redirects (TipForm line 54).

---

## 2. Where the user gets redirected and why

```
TipForm.tsx:54   window.location.href = data.checkoutUrl
```

The `checkoutUrl` is a Flutterwave **Standard** checkout page:

```
https://checkout.flutterwave.com/v3/hosted/pay/<session-id>
```

This is a fully hosted page on Flutterwave's domain. The user enters their card
details, PIN, and OTP there. **Our server never touches the card data.** The
reason we redirect to Flutterwave's domain (instead of embedding a form) is:

- **PCI-DSS compliance.** Handling raw card numbers requires a SAQ or audit.
  Flutterwave handles all of that. Our app never sees a PAN, CVV, or PIN.

- **No secret key on the client.** If we used the Inline JS SDK, we would need
  to expose the public key in the browser bundle. With the Standard flow, both
  the public and secret keys remain server-side.

- **Fraud surface reduction.** Flutterwave's checkout includes 3D Secure,
  rate-limiting, and their own fraud detection. We get that for free.

After the user completes (or cancels) payment, Flutterwave appends query
parameters to the `redirect_url` we specified during initiation and sends the
browser back:

```
/tip/<slug>/success?transaction_id=1234567&tx_ref=tip-1719000000-abc123&status=successful
```

The key here is that `status=successful` is a **URL query parameter** — it is
trivially forgeable. Anyone can type
`/tip/<slug>/success?transaction_id=anything&status=successful` into their
address bar. This is why the next two sections matter.

---

## 3. How the server verifies the transaction

Verification happens in **`app/api/tip/verify/route.ts`**, which is called by
the success page via **`lib/flutterwave.ts:verifyTransaction()`**.

### Step 1 — Idempotency check (lines 18–33)

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transactionId },
})
```

The handler first checks whether a tip with this `flutterwaveTransactionId`
already exists in the database. If it does, the tip was already verified in a
previous request — this prevents double-crediting if the user refreshes the
success page or if Flutterwave redirects twice.

### Step 2 — Server-to-server verification (line 35)

```ts
const transaction = await verifyTransaction(transactionId)
```

Inside `lib/flutterwave.ts`, `verifyTransaction` makes a `GET` request to:

```
https://api.flutterwave.com/v3/transactions/<transactionId>/verify
```

This call is authenticated with the **secret key** (`FLWSECK_TEST-...`). The
response contains the *real* transaction data as recorded by Flutterwave's
servers — not the URL parameters that the browser sent:

```json
{
  "status": "success",
  "data": {
    "id": 1234567,
    "tx_ref": "tip-1719000000-abc123",
    "amount": 5000,
    "currency": "NGN",
    "status": "successful",
    "customer": { "email": "fan@example.com" }
  }
}
```

### Step 3 — Validate fields (lines 37–49)

Three checks are made against the verified data:

| Check | Line | Purpose |
|---|---|---|
| `status === "successful"` | 37 | Payment actually completed. Rejects `"failed"` or `"pending"`. |
| `currency === "NGN"` | 44 | Confirms the charge was in the expected currency. Catches a scenario where the initiation payload said NGN but Flutterwave charged something else. |
| `amount >= tipRecord.amount` | 62 | Prevents a partial-payment attack. If the user initiated a tip of 5000 NGN but only 100 NGN was charged, this check rejects it. Uses `>=` (not `===`) because Flutterwave may add an overage fee; the charged amount can be slightly higher than the intended amount. |

### Step 4 — Look up the PENDING record (lines 51–60)

```ts
const tipRecord = await prisma.tip.findUnique({
  where: { txRef: transaction.tx_ref },
})
```

The handler matches the `tx_ref` from Flutterwave's verified response to our
`PENDING` tip record created during initiation. If no matching record exists,
the transaction is rejected — this prevents a scenario where someone takes a
valid Flutterwave transaction from a different app and replays it here.

### Step 5 — Update to VERIFIED (lines 69–76)

```ts
const updated = await prisma.tip.update({
  where: { id: tipRecord.id },
  data: {
    flutterwaveTransactionId: String(transaction.id),
    status: "VERIFIED",
    verifiedAt: new Date(),
  },
})
```

The `PENDING` record is promoted to `VERIFIED`. The `flutterwaveTransactionId`
is stored so future requests are caught by the idempotency check. A
`verifiedAt` timestamp is recorded for sorting and auditing.

### The success page (server component)

The success page at **`app/tip/[slug]/success/page.tsx`** is an **async server
component** (line 8). It does NOT trust the incoming `status` query parameter
to decide whether the payment succeeded. It:

1. Reads `status` and `transaction_id` from `searchParams` (line 16).
2. If `status` is not `"successful"` or there is no `transaction_id`, it
   renders the "Payment unsuccessful" state immediately (lines 21–37).
3. Otherwise, it calls `verifyTransaction(transaction_id)` directly (line 43)
   — the same server-to-server call described above.
4. If verification fails, it renders "Verification failed" with the error
   message (lines 95–109).
5. If verification succeeds, it renders the receipt showing amount, tipper
   name, message, date, and a green "Verified" badge (lines 111–167).

---

## 4. Why client-side success messages must never be trusted alone

The `status=successful` parameter that Flutterwave appends to the redirect URL
is **visible to and modifiable by the user**. Here is why that matters:

### Forgeability

A user can navigate to:
```
/tip/victor-dev/success?transaction_id=999999&status=successful
```
and the browser would render whatever the client-side code shows for a
successful payment. If the app only checks `searchParams.status`, an attacker
could generate a fake "success" page without paying anything.

The same applies to the `status` field in a Flutterwave Inline JS callback. A
malicious actor can modify the browser's JavaScript at runtime with DevTools,
call the success callback with fabricated data, and the app would be
none-the-wiser if it only checks the callback payload.

### The verification gap

Flutterwave's Standard checkout appends the `status` parameter on every
redirect, including for **failed** transactions (where `status=successful`
might not be set, but a clever attacker could try to add it). Without
server-side verification, there is no way to distinguish between:

- A legitimate redirect from Flutterwave after a real payment.
- A crafted URL in the browser address bar.
- A replayed callback from a previous transaction (duplicate `transaction_id`).

### What our code does about it

1. **The success page never uses `searchParams.status` to decide the outcome.**
   It reads the status, but the real decision comes from the server-to-server
   `verifyTransaction` call (line 43).

2. **The verify API is authenticated by the secret key.** A client cannot call
   Flutterwave's verify endpoint directly because it does not know the
   `FLWSECK_TEST` key. Only our server can make that call.

3. **Amounts are compared against the database record.** Even if someone
   obtains a valid `transaction_id` from a 100 NGN payment they made, they
   cannot reuse it for a 5000 NGN tip — the `amount >= tipRecord.amount` check
   (verify route line 62) enforces the match.

4. **Idempotency prevents replay.** The same `transaction_id` can never be
   credited twice (verify route line 18). If a user refreshes the success page,
   the server returns the cached result from the first verification instead of
   double-counting the tip.

### Summary table

| Attack | How it works | How we stop it |
|---|---|---|
| Forge URL | Type `?status=successful` manually | Server ignores URL params; calls Flutterwave verify API |
| Replay transaction | Use same `transaction_id` twice | Idempotency check on `flutterwaveTransactionId` |
| Amount mismatch | Pay 100 NGN, claim 5000 NGN | Amount check against DB record (`>=`) |
| Cross-app replay | Use a transaction from another app | `tx_ref` must match a PENDING record in our DB |
| Tampered JS callback | Modify Inline SDK callback payload | We use Standard redirect, not Inline JS; server verifies |

The rule is simple: **the browser cannot be trusted with payment outcome.** The
only source of truth is Flutterwave's `GET /v3/transactions/{id}/verify`
endpoint, called by the server with the secret key that never leaves
`process.env`.
