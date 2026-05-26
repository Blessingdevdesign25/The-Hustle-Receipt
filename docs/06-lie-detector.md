# Lie Detector — Five Statements, One False

---

## The Statements

| # | Statement |
|---|---|
| 1 | The `POST /api/tip/initiate` handler writes a `PENDING` tip record to the database before it ever calls Flutterwave's API. |
| 2 | During verification, the amount from Flutterwave's API must exactly equal the stored tip amount, or the transaction is rejected. |
| 3 | The `flutterwaveTransactionId` column on the `Tip` model has a `@unique` constraint, preventing the same transaction from being credited twice at the database level. |
| 4 | The success page is a server component that calls `verifyTransaction()` using the secret key from `process.env`. |
| 5 | The `tx_ref` from Flutterwave's verified response is used to look up the `PENDING` tip record during verification. |

---

## Investigation

### Statement 1: True

In `app/api/tip/initiate/route.ts`:

```ts
// Line 40 — tip is created first
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

// Line 52 — Flutterwave is called second
const checkoutUrl = await initiatePayment({
  txRef,
  amount,
  ...
})
```

The `PENDING` record is written at line 40. `initiatePayment` is not called until
line 52. If Flutterwave's API is down or returns an error, the `PENDING` record
still exists as an audit trail.

---

### Statement 2: ❌ FALSE

The claim is that the check is `===` (exact equality). The actual code in
`app/api/tip/verify/route.ts` line 62 is:

```ts
if (transaction.amount < tipRecord.amount) {
```

This is the **inverse** of `>=`. The check is **`transaction.amount >= tipRecord.amount`**
— the charged amount must be **at least** the stored amount. It is **not** strict
equality.

Why `>=` and not `===`? As documented in `docs/01-explanation.md` line 187:

> Uses `>=` (not `===`) because Flutterwave may add an overage fee; the charged
> amount can be slightly higher than the intended amount.

If someone paid 5000 NGN and Flutterwave charged 5025 NGN (e.g. a convenience
fee), `===` would reject it and return `"Amount mismatch"`. `>=` correctly
allows it.

**A strict `===` check would break on valid payments that include Flutterwave's
surcharge.**

---

### Statement 3: True

In `prisma/schema.prisma` line 78:

```prisma
flutterwaveTransactionId String?   @unique
```

The `@unique` constraint means the database itself refuses to store a second
tip with the same `flutterwaveTransactionId`. Even if two concurrent requests
both pass the application-level idempotency check (a race condition), only one
can execute the `update` — the second hits a unique constraint violation and
throws.

---

### Statement 4: True

`app/tip/[slug]/success/page.tsx` has no `"use client"` directive, making it a
server component. On line 43 it calls:

```ts
const transaction = await verifyTransaction(transaction_id)
```

Inside `lib/flutterwave.ts` lines 68–82, `verifyTransaction` reads
`process.env.FLUTTERWAVE_SECRET_KEY` (line 1) and sends it as a Bearer token
(line 71). Neither the secret key nor the `lib/flutterwave.ts` module is
imported by any `"use client"` component in the codebase.

---

### Statement 5: True

In `app/api/tip/verify/route.ts` lines 51–52:

```ts
const tipRecord = await prisma.tip.findUnique({
  where: { txRef: transaction.tx_ref },
})
```

`transaction` is the object returned by `verifyTransaction(transactionId)`
(line 35). It contains `tx_ref` as a field of Flutterwave's verified response.
This `tx_ref` matches the one generated during initiation (`lib/utils.ts` line
11) and stored in the `PENDING` record (`initiate/route.ts` line 47). If no
matching `tx_ref` exists in the database, the verification fails with 404
(lines 55–60).

---

## Verdict

| Statement | Verdict |
|---|---|
| 1. PENDING record created before Flutterwave call | ✅ True |
| 2. Amount must strictly equal (`===`) the stored amount | ❌ **FALSE** — uses `>=` |
| 3. `flutterwaveTransactionId` has `@unique` constraint | ✅ True |
| 4. Success page is a server component using secret key | ✅ True |
| 5. `tx_ref` from verified response looks up PENDING record | ✅ True |

**The lie is Statement 2.** The amount check uses `transaction.amount < tipRecord.amount`
(rejecting only when charged < stored), which is equivalent to `>=` allowing.
A strict `===` check would break on Flutterwave overage fees and is not what
the code does.
