# Security Audit — Hard Questions

---

## Q1: What if an attacker calls the success route directly with a fake transaction ID?

**Attack:** Navigate to
`/tip/victor-dev/success?transaction_id=FAKE&status=successful`

**What happens step by step:**

1. The success page reads `searchParams` (`00-explanation.md` line 16):
   ```ts
   const { transaction_id, status } = await searchParams
   ```
   `transaction_id` is `"FAKE"`, `status` is `"successful"`. The quick check on
   line 21 (`status !== "successful" || !transaction_id`) passes — both values
   are present and the attacker set `status=successful`.

2. The page calls Flutterwave's verification API (`00-explanation.md` line 43):
   ```ts
   const transaction = await verifyTransaction(transaction_id)
   ```
   This sends `GET https://api.flutterwave.com/v3/transactions/FAKE/verify`
   with the secret key. Flutterwave responds with:
   ```json
   { "status": "error", "message": "No transaction was found for this id" }
   ```

3. `verifyTransaction` throws (`lib/flutterwave.ts` line 77–78):
   ```ts
   if (data.status !== "success") {
     throw new Error("Verification failed: " + data.message)
   }
   ```

4. The catch block in the success page (`00-explanation.md` lines 91–93)
   catches the error and sets `error` to a non-null string:
   ```ts
   } catch (e) {
     error = e instanceof Error ? e.message : "Verification failed"
   }
   ```

5. The error branch renders (`00-explanation.md` lines 95–109):
   ```
   "Verification failed"
   "No transaction was found for this id"
   "Try again" (link back to tip page)
   ```

**Result:** The attacker sees an error page. No tip record is created, no
dashboard entry appears, no money moves. The attack is **blocked**.

**What if the attacker uses a real `transaction_id` from a different
Flutterwave account?**

`verifyTransaction` would succeed (Flutterwave returns the transaction data),
but the verify route's `tx_ref` check (`verify/route.ts` lines 51–60) would
fail:

```ts
const tipRecord = await prisma.tip.findUnique({
  where: { txRef: transaction.tx_ref },
})
```

The `tx_ref` from the other account's transaction would not match any
`PENDING` record in our database. The handler returns a 404 with
`"Transaction reference not found"`. **Blocked.**

**What if the attacker uses a real `transaction_id` from their own legitimate
tip to this creator, but replays it?**

The idempotency check (`verify/route.ts` lines 18–33) catches this:

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transactionId },
})
```

The first time the tip was processed, `flutterwaveTransactionId` was set
(`verify/route.ts` line 72). The second call returns the existing record and
renders the receipt again — but the tip is not double-counted. **Blocked.**

---

## Q2: What if Flutterwave's callback fires twice (double-credit risk)?

**Scenario:** A user completes a payment on Flutterwave's checkout. Flutterwave
redirects to `/tip/slug/success?transaction_id=123&status=successful`. The
server verifies, writes `VERIFIED`, renders the receipt. The user refreshes the
page. Flutterwave (or a webhook retry) sends the same callback again.

**Defense 1 — idempotency lookup (`verify/route.ts` lines 18–33):**

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transactionId },
})

if (existing) {
  return NextResponse.json({
    verified: true,
    tip: {
      amount: existing.amount,
      ...
    },
  })
}
```

The `flutterwaveTransactionId` column is set on the first verify (`verify/route.ts`
line 72). Any subsequent call with the same `transactionId` finds the existing
record and returns the cached result. The `update` on line 69 is never reached
a second time.

**Defense 2 — database constraint (`prisma/schema.prisma`):**

```prisma
flutterwaveTransactionId String?   @unique
```

Even if two concurrent requests passed the `findUnique` check (race condition),
only one could execute the `update` successfully. The second would hit a unique
constraint violation on `flutterwaveTransactionId`. The catch block
(`verify/route.ts` lines 88–91) would return a 500, and the tip would still be
credited exactly once (the first write succeeded).

**Defense 3 — idempotency in the success page (`success/page.tsx` lines 49–60):**

The success page has its own idempotency check before attempting to update:

```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: transaction_id },
})

if (existing) {
  tip = { amount: existing.amount, ... }
}
```

If the user refreshes the page after the verify API already processed the
transaction, the success page finds the existing record (because the verify
route set `flutterwaveTransactionId`) and renders the receipt without touching
the database again.

**Result:** Double-credit is **blocked** at three layers (application
idempotency check, database unique constraint, success page guard).

---

## Q3: Is the secret key ever exposed to the client bundle?

**Code location — `lib/flutterwave.ts` line 1:**

```ts
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!
```

`process.env` is a Node.js runtime API. It does not exist in the browser.
Next.js's bundler (Turbopack in v16) statically analyzes imports and does not
include server-only modules in client bundles.

**Who imports this module?**

| Importer | File type | Bundled for client? |
|---|---|---|
| `app/api/tip/initiate/route.ts` | Route handler (server only) | No |
| `app/api/tip/verify/route.ts` | Route handler (server only) | No |
| `app/tip/[slug]/success/page.tsx` | Server component | No — renders on server |

No client component (`"use client"`) imports `lib/flutterwave.ts`. The
TipForm.tsx client component imports nothing from `lib/` — it only calls
`fetch("/api/tip/initiate")`, which hits the server endpoint.

**What about the public key?**

In `.env.local`:

```
NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-...
```

This key is prefixed with `NEXT_PUBLIC_`, which is Next.js's convention for
env vars that are safe to inline into client bundles. The public key is
designed to be public — it identifies the merchant to Flutterwave's API and is
sent in the browser's JavaScript when using Flutterwave's Inline JS SDK. In
this project it is not actually used anywhere (the app uses Standard checkout,
not Inline JS), but it is harmless.

**What if a developer accidentally imports `verifyTransaction` in a client
component?**

The import would compile (Turbopack would bundle it) but at runtime `process`
would be undefined and the module would crash. To prevent this, Next.js 16 can
be configured with `serverExternalPackages` or the import can be wrapped in a
server-only function. The current codebase relies on convention: no `"use
client"` file imports from `lib/flutterwave.ts`.

**Result:** The secret key is **not exposed** to the client bundle. It lives in
`process.env` server-side, is used only in server route handlers and server
components, and is never returned in API responses.

---

## Q4: What if the verify API call fails?

**Possible failures:**

| Failure mode | What happens | Impact |
|---|---|---|
| Flutterwave API is down | `fetch` throws network error | Catch block returns 500 to caller |
| Flutterwave returns non-200 | `data.status !== "success"` → throw | Catch block returns 500 with error message |
| Flutterwave rate-limits us | HTTP 429 response | Treated as non-success → throw → 500 |
| DNS resolution fails | `fetch` throws `ENOTFOUND` | Catch block returns 500 |
| TLS certificate error | `fetch` throws | Catch block returns 500 |

**Code path — `verify/route.ts` lines 88–91:**

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "Verification failed"
  return NextResponse.json({ verified: false, error: message }, { status: 500 })
}
```

The API returns `{ verified: false, error: "..." }` with a 500 status.

**Code path — `success/page.tsx` lines 91–109 (when called from the success
page directly):**

```ts
} catch (e) {
  error = e instanceof Error ? e.message : "Verification failed"
}
// ...
if (error || !tip) {
  return (
    // "Verification failed" page with Try Again link
  )
}
```

The user sees a "Verification failed" page with an error message and a link
back to the tip page.

**What about the PENDING record that was already written?**

The tip exists in the database with `status: "PENDING"`. It is not credited to
the creator's dashboard (the dashboard only sums `VERIFIED` tips). The pending
record serves as an audit trail.

**Can the user retry?**

The user can navigate back to the tip page and submit again. However, the same
`txRef` cannot be reused because it has a `@unique` constraint. A new `txRef`
is generated on each submission (`initiate/route.ts` line 36).

**What if Flutterwave actually processed the payment but our verify call
failed?**

This is the worst case. The user was charged but sees a failure page. There is
**no automatic retry mechanism** in the current code. The user would need to
contact support or the tip would need to be reconciled manually via
Flutterwave's dashboard.

**Mitigation (not implemented — noted as a gap):**

A webhook endpoint (`POST /api/webhooks/flutterwave`) would receive
transaction-complete events from Flutterwave server-to-server, independent of
the browser redirect. This would catch payments where the verify call failed or
the user closed the browser before the redirect. The architecture spec
mentions this in the FLUTTERWAVE.md but it is not built.

**Result:** The verify call failure is **handled gracefully** (error page, no
data corruption) but **not recovered automatically** (no retry, no webhook).
This is an acceptable gap for a capstone project but would need a webhook for
production.

---

## Q5: Are amounts validated server-side or only on the client (so an attacker
cannot change the amount in the request)?

**Client-side validation — `components/TipForm.tsx` lines 27–30:**

```ts
const numAmount = Number(amount)
if (!numAmount || numAmount < 100) {
  setError("Amount must be at least 100 NGN")
  setLoading(false)
  return
}
```

This is a UX guard, not a security control. It prevents accidental zero-amount
submissions without a round-trip to the server.

**Server-side validation — `initiate/route.ts` lines 18–23:**

```ts
if (typeof amount !== "number" || amount < 100) {
  return NextResponse.json(
    { error: "Amount must be at least 100 NGN" },
    { status: 400 }
  )
}
```

The server re-validates the amount. An attacker can bypass the client (curl,
Postman, or modified browser JS) and send any value. The server check catches
amounts that are not numbers, negative amounts, and amounts below 100 NGN.
Without this check, an attacker could send `amount: 1` and initiate a 1 NGN
payment.

**What about the amount stored for verification?**

The server stores the amount it received (`initiate/route.ts` line 45):

```ts
amount,
```

The attacker's manipulated amount is what gets stored in the `PENDING` record.
This matters because the verification step compares the Flutterwave-charged
amount against this stored amount (`verify/route.ts` line 62):

```ts
if (transaction.amount < tipRecord.amount) {
  return NextResponse.json(
    { verified: false, error: "Amount mismatch" },
    { status: 400 }
  )
}
```

**Attack scenario:** Attacker sends `amount: 100` to `/api/tip/initiate`. The
server creates a PENDING record for 100 NGN and sends `amount: 100` to
Flutterwave's checkout. The attacker pays 100 NGN. Flutterwave calls back. The
verify check passes because `transaction.amount (100) >= tipRecord.amount
(100)`.

The attacker tipped 100 NGN instead of the displayed 5000 NGN. The damage is
limited to the attacker's own payment — they cannot credit more than they paid.

**Attack scenario:** Attacker sends `amount: 999999` hoping to receive credit
for a larger amount than they actually pay. The server creates a PENDING record
for 999999 NGN and sends `amount: 999999` to Flutterwave. Flutterwave's
checkout presents a charge of 999999 NGN. The attacker must actually pay
999999 NGN for verification to succeed. The `transaction.amount >=
tipRecord.amount` check would pass only if Flutterwave charged at least 999999
NGN.

**What if the attacker changes the amount between initiation and
verification?**

They can't. The amount is locked in the `PENDING` database record. The verify
route reads `tipRecord.amount` from the database, not from any request
parameter.

**What about the Flutterwave payload?**

The `initiatePayment` function sends the amount to Flutterwave
(`lib/flutterwave.ts` line 24):

```ts
amount: payload.amount,
```

The attacker cannot modify this between server and Flutterwave because it's a
server-to-server HTTPS call.

**Result:** Amounts are **validated on both client and server**. The server
stores the amount in the database at initiation time and uses that stored value
during verification. An attacker can lower the amount they pay (by modifying
the initiate request), but they cannot receive credit for more than they
actually paid. The `>=` check on line 62 ensures this.

---

## Summary of findings

| Question | Outcome | Key defense |
|---|---|---|
| Fake transaction ID | Blocked | Flutterwave verify API returns error for unknown IDs |
| Double callback | Blocked (triple-redundant) | Idempotency check + unique constraint + success page guard |
| Secret key in client bundle | Not exposed | Server-only imports, no `"use client"` file imports `flutterwave.ts` |
| Verify API failure | Handled but not auto-recovered | Error page shown; PENDING record remains for manual reconciliation |
| Amount manipulation | Blocked | Server re-validates, stores in DB, compares at verify time |

**One gap identified:** No webhook for out-of-band payment confirmation. If the
verify call fails after Flutterwave charges the user, the payment is lost. A
webhook endpoint (`POST /api/webhooks/flutterwave`) with `verif-hash` header
validation would close this gap.
