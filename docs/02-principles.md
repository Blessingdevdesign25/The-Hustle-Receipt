# Payment Integration Principles — Code Map

This document maps five security principles of payment integration to the exact
lines of code that implement them in The Hustle Receipt.

---

## 1. Trust boundaries between client and server

**Principle:** The client (browser) is an untrusted environment. Any value that
originates in the client — form inputs, URL parameters, JavaScript variables —
must be treated as potentially hostile. The server is the only trusted
execution context.

### Code map

**`lib/flutterwave.ts` line 1 — secret key lives only on the server**

```ts
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!
```

`process.env` is a Node.js global. This line never executes in the browser
because `lib/flutterwave.ts` is only imported by API route handlers (which run
on the server) and async server components (which also run on the server).
Next.js's bundler tree-shakes this module out of any client bundle. If a
developer accidentally imported `initiatePayment` from a `"use client"` file,
Next.js would throw a build error because `process` is not available in the
browser.

**`app/api/tip/initiate/route.ts` lines 40–49 — PENDING record written
server-side before Flutterwave is called**

```ts
await prisma.tip.create({
  data: {
    creatorId: creator.id,
    tipperName: tipperName || null,
    tipperEmail,
    amount,
    message: message || null,
    txRef,
    status: "PENDING",
  },
})
```

The `amount` that the server stores comes from the request body, which the
client sent. Note that the client also displays this amount in the UI, but the
server does not trust the client to report the correct amount later — it stores
its own copy in the database. When verification happens, the stored amount is
compared against Flutterwave's record, not against anything the client says.

**`components/TipForm.tsx` line 54 — client only receives a redirect URL**

```ts
window.location.href = data.checkoutUrl
```

The client never handles card data, never constructs a payment payload, and
never signs a request. Its only role is to POST form fields and navigate to the
URL the server returns. The trust boundary is clean: the client sends what the
user typed; the server decides what to do with it.

**`app/tip/[slug]/success/page.tsx` lines 15–16 — URL params are read but not
trusted for the final decision**

```ts
const { slug } = await params
const { transaction_id, status } = await searchParams
```

`searchParams` comes from the URL, which the user can modify. The success page
reads `status` and `transaction_id` as hints, but the actual outcome is
determined by the server-side `verifyTransaction` call on line 43.

### Violation to watch for

If any API route handler reads `FLUTTERWAVE_SECRET_KEY` and returns it in the
JSON response, the trust boundary is breached. Similarly, if `initiatePayment`
were imported in a client component, the secret key would leak into the bundle.
This codebase avoids both by keeping `lib/flutterwave.ts` server-only.

---

## 2. Server-side verification as the only source of truth

**Principle:** A payment is not confirmed until the server has called the
payment provider's verification endpoint with the secret key and validated the
response against the application's own records. URL parameters, client-side
callbacks, and webhook notifications are advisory at best.

### Code map

**`lib/flutterwave.ts` lines 68–82 — verifyTransaction calls Flutterwave directly**

```ts
export async function verifyTransaction(transactionId: string): Promise<FlwTransaction> {
  const res = await fetch(`${FLW_BASE}/transactions/${transactionId}/verify`, {
    headers: {
      Authorization: `Bearer ${FLW_SECRET}`,
    },
  })

  const data = await res.json()

  if (data.status !== "success") {
    throw new Error("Verification failed: " + data.message)
  }

  return data.data as FlwTransaction
}
```

This is a server-to-server `GET` to Flutterwave's verification endpoint. The
request is authenticated with the **secret key** — the same key used at
initiation. The response is Flutterwave's own record of the transaction,
fetched from their internal database. The client cannot forge this response
because it does not know the secret key.

**`app/api/tip/verify/route.ts` lines 37–67 — four validations against the
verified data**

```ts
// line 37 — status must be "successful"
if (transaction.status !== "successful") { ... }

// line 44 — currency must match
if (transaction.currency !== "NGN") { ... }

// line 51–60 — tx_ref must match a PENDING record we wrote
const tipRecord = await prisma.tip.findUnique({
  where: { txRef: transaction.tx_ref },
})

// line 62 — charged amount must be at least the intended amount
if (transaction.amount < tipRecord.amount) { ... }
```

Each check eliminates a class of attack:
- **Status check:** Rejects failed or pending transactions.
- **Currency check:** Rejects charges in a different currency than NGN.
- **tx_ref check:** Ensures this transaction originated from our app, not from
  a different application using the same Flutterwave account.
- **Amount check:** Uses `>=` (not `===`) to allow Flutterwave surcharges while
  preventing partial payments.

**`app/tip/[slug]/success/page.tsx` line 43 — the success page calls verify
from the server**

```ts
const transaction = await verifyTransaction(transaction_id)
```

This runs in an async server component, not in the browser. Even though the
page is rendered in response to a browser navigation, the verification call
happens on the server during rendering. The page does not render the receipt
until the server confirms the payment.

### What happens without this principle

If the app trusted `searchParams.status === "successful"` and saved the tip
without calling Flutterwave's API, anyone could type
`/tip/victor-dev/success?transaction_id=anything&status=successful` and the
dashboard would show a fake tip. The server-side verify call is the difference
between a real payment and a forged URL.

---

## 3. Idempotency for repeated webhook or callback hits

**Principle:** Payment callbacks (redirects, webhooks, polling) can arrive more
than once — the user may refresh the success page, Flutterwave may retry a
webhook, or network issues may cause duplicate deliveries. Every handler must
be idempotent: processing the same notification twice must produce the same
result as processing it once.

### Code map

**`app/api/tip/verify/route.ts` lines 18–33 — idempotency check via
`flutterwaveTransactionId`**

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transactionId },
})

if (existing) {
  return NextResponse.json({
    verified: true,
    tip: { ... },
  })
}
```

The `flutterwaveTransactionId` column in the `tips` table has a `@unique`
constraint in the Prisma schema:

```prisma
flutterwaveTransactionId String?   @unique
```

The first time a transaction is verified, this column is set (route.ts line
72). If the verify endpoint is called again with the same `transactionId`, the
`findUnique` on line 18 returns the existing record, and the handler returns
the cached result — the tip is credited exactly once.

**`app/tip/[slug]/success/page.tsx` lines 49–60 — the success page has its own
idempotency logic**

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transaction_id },
})

if (existing) {
  tip = { amount: existing.amount, ... }
}
```

This is a belt-and-suspenders approach. If a user refreshes the success page
after the verify API already processed the transaction, the success page finds
the existing record and renders the receipt without calling `update` again.

### Design rationale

The `@unique` constraint is the database-level guarantee. If two concurrent
requests somehow pass the `findUnique` check and both attempt to `update`, the
second one will succeed (it overwrites with the same values) because the
update is identified by `id` (primary key), not by `flutterwaveTransactionId`.
The constraint prevents a scenario where two different transactions claim the
same `flutterwaveTransactionId`.

### Violation to watch for

If the code used `prisma.tip.create` instead of `prisma.tip.update` during
verification, the `@unique` constraint on `txRef` would throw on duplicate,
but the transaction would be lost (the user would see an error page despite
having paid). The current code avoids this by using `update` with a prior
`findUnique`.

---

## 4. Separation of test and production keys

**Principle:** Test keys and live keys are different credentials that access
different environments (sandbox vs. production). They must be stored in
different environment variables, never mixed, and never both present in the
same deployment.

### Code map

**`.env.local` lines 6–8 — test keys are clearly labelled**

```
FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X"
NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY="FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X"
```

The `TEST` infix in both keys (`FLWSECK_TEST-...`, `FLWPUBK_TEST-...`) is the
Flutterwave convention that identifies sandbox credentials. Production keys
omit `TEST` (`FLWSECK-...`, `FLWPUBK-...`).

**`lib/flutterwave.ts` line 1 — the code reads a single env var**

```ts
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!
```

The code does not reference `FLUTTERWAVE_SECRET_KEY_TEST` or
`FLUTTERWAVE_SECRET_KEY_LIVE` — there is one variable name. The separation
happens in the deployment environment:

| Environment | `FLUTTERWAVE_SECRET_KEY` value |
|---|---|
| Local dev | `FLWSECK_TEST-...` |
| Staging | `FLWSECK_TEST-...` |
| Production | `FLWSECK-...` (live) |

This means the same codebase works in all environments. The operator sets the
correct key in each environment's configuration (`.env.local`, Vercel env vars,
etc.). The code never needs to know which environment it is in.

**`.env.local` line 8 — public key is prefixed with `NEXT_PUBLIC_`**

```
NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
```

The `NEXT_PUBLIC_` prefix is Next.js's convention for environment variables
that are safe to expose to the client bundle. The public key is designed to be
public — it identifies the merchant to Flutterwave's API. The secret key never
gets this prefix.

**`.gitignore` lines 33–34 — env files are gitignored**

```
# env files (can opt-in for committing if needed)
.env*
```

This prevents accidentally committing test keys (or worse, production keys) to
the repository. Each developer creates their own `.env.local` with their test
keys.

### Violation to watch for

If the code had a fallback like:
```ts
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY_TEST
```
it would be possible for a production deployment to accidentally use the test
key if the production env var was misspelled. The current code has no fallback
— if `FLUTTERWAVE_SECRET_KEY` is not set, the `!` non-null assertion causes a
runtime crash, which is the safest failure mode.

---

## 5. Never logging or exposing secret keys

**Principle:** A payment secret key is equivalent to a password — anyone who
has it can initiate charges on your behalf. It must never appear in logs,
error messages, database records, HTML output, or API responses.

### Code map

**`app/api/tip/initiate/route.ts` lines 64–67 — errors omit the secret key**

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to initiate payment"
  return NextResponse.json({ error: message }, { status: 500 })
}
```

If `initiatePayment` throws (e.g., Flutterwave API returns an error), the
catch block extracts only `error.message`. The `message` property of a
JavaScript Error contains the text passed to `new Error(...)`. In
`lib/flutterwave.ts` line 42:

```ts
throw new Error(data.message || "Failed to initiate payment")
```

`data.message` comes from Flutterwave's API response, which does not contain
the secret key. The code never passes the secret key as part of the error
message.

**`lib/flutterwave.ts` lines 19–20 — the secret key is sent in an HTTP header**

```ts
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${FLW_SECRET}`,
},
```

The `Authorization` header is handled by the Fetch API. It is not written to
`console.log`, not returned in the function's return value, and not included in
the JSON body. Standard HTTP security: the header is transmitted over TLS and
never persisted.

**Error boundary on verify — same pattern**

```ts
// app/api/tip/verify/route.ts lines 88–91
} catch (error) {
  const message = error instanceof Error ? error.message : "Verification failed"
  return NextResponse.json({ verified: false, error: message }, { status: 500 })
}
```

Again, `error.message` is Flutterwave's error text, not the secret key. The raw
`error` object, which might contain a stack trace with function arguments, is
not serialized to the response.

**The verify function does not log**

`lib/flutterwave.ts:verifyTransaction` (lines 68–82) contains no `console.log`,
no `console.error`, and no logging library call. The only observable output is
the return value (`FlwTransaction`) or the thrown error. If a developer adds
logging later, the principle must hold: log the `transactionId` and the HTTP
status code, but never the `Authorization` header value.

### Violation to watch for

If any route handler included the header object in an error report:
```ts
console.error("Flutterwave request failed", { headers: { Authorization: `Bearer ${FLW_SECRET}` } })
```
the secret key would appear in server logs. The current code avoids this by
never referencing `FLW_SECRET` outside the fetch call configuration.

### Audit checklist

| File | Line | What to check |
|---|---|---|
| `lib/flutterwave.ts` | 1 | `process.env.FLUTTERWAVE_SECRET_KEY` — only reference to the secret |
| `lib/flutterwave.ts` | 20 | Secret used in `Authorization` header — never logged |
| `lib/flutterwave.ts` | 69–71 | Same pattern for verify |
| `app/api/tip/initiate/route.ts` | 64–66 | Error caught, only `.message` returned |
| `app/api/tip/verify/route.ts` | 88–90 | Same pattern |
| `.env.local` | 6 | Key is gitignored via `.env*` pattern |
| `.env.local` | 8 | Public key has `NEXT_PUBLIC_` prefix — intentionally exposed |
| `lib/flutterwave.ts` | 45 | Return value is the checkout link, not the API response body |
