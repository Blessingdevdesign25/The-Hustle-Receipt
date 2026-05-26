# Security Audit — Payment Flow Cross-Check

---

Payment flows are highly critical paths where subtle logical flaws can lead to severe security bypasses. This audit cross-checks the entire payment verification pipeline in **The Hustle Receipt** to answer a key security concern:

> **How could an attacker complete a tip on the dashboard without actually paying?**

Below is a detailed analysis of why direct database/dashboard-level bypasses are blocked, the discovery of a subtle **Visual Receipt Spoofing** vulnerability, and a concrete remediation plan to secure the application.

---

## 1. Dashboard-Level Bypass Analysis (Is it possible?)

To understand if an attacker can force a tip to show up as **`VERIFIED`** on a creator's dashboard without actually paying, we trace the security controls at each phase of the payment lifecycle.

### Phase A: Tip Initiation (`POST /api/tip/initiate`)

1. **Server-Side Generation of `txRef`:**
   ```ts
   const txRef = generateTxRef() // e.g. tip-1719000000-abc123
   ```
   The client cannot choose or inject the transaction reference. The server generates this value on the fly, saves a `PENDING` tip record in the database with that reference, and passes the exact reference to Flutterwave via a secure server-to-server HTTPS call.
2. **Immutable Amounts:** The client sends an `amount` parameter, which the server re-validates (must be a number $\ge 100$ NGN). This amount is locked into the `PENDING` database record at initiation and sent to Flutterwave. It cannot be altered by the client afterwards.

### Phase B: Redirection & Payment

* **Hosted Checkout Isolation:** The browser is redirected to a tokenized page on Flutterwave's domain (`checkout.flutterwave.com`). The payment amount is bound to the Flutterwave transaction session created server-to-server. The attacker cannot alter the payment details on Flutterwave's page.

### Phase C: Verification (`verify/route.ts` & `success/page.tsx`)

When the user returns from checkout, the server performs the following strict sequence of checks before promoting the tip to `VERIFIED`:

```
[Incoming transaction_id]
        │
        ▼
[Flutterwave GET /v3/transactions/{id}/verify]  ◄─── Authenticated by Server-Only Secret Key
        │
        ├───► [Check 1: status === "successful"] (Fails if unpaid, canceled, or pending)
        │
        ├───► [Check 2: currency === "NGN"] (Fails if currency manipulated)
        │
        ▼
[Database Query: Find tipRecord where txRef === transaction.tx_ref]
        │
        ├───► [Check 3: Record exists?] (Fails if transaction belongs to another merchant/app)
        │
        ├───► [Check 4: transaction.amount >= tipRecord.amount] (Fails if attacker paid less than expected)
        │
        ▼
[Database Update: Set status to VERIFIED]
```

### Conclusion on Dashboard-Level Bypass
An attacker **cannot** inject a verified tip onto a creator's dashboard without actually paying because:
* **The Flutterwave Secret Key is never exposed to the client.** The browser cannot spoof Flutterwave's API response.
* **The `tx_ref` returned by Flutterwave is immutable.** The server looks up the tip record based on the `tx_ref` returned by Flutterwave's secure verification response. The attacker cannot make a cheap NGN 100 payment and associate it with a pending NGN 10,000 tip because the NGN 100 transaction will return `tx_ref: tip-cheap`, which only resolves to the NGN 100 pending record in the database.
* **The `>=` amount check blocks partial payments.** Any attempt to pay less than the database-locked amount is instantly rejected with `Amount mismatch` (400).

---

## 2. The Vulnerability: Visual Receipt Spoofing & Replay Attack

While an attacker cannot credit a creator's database/dashboard without paying, there is a **subtle UX-level logical vulnerability** in `app/tip/[slug]/success/page.tsx` and `app/api/tip/verify/route.ts`.

An attacker can generate a **fully verified "Payment confirmed!" success page for a victim creator** without paying them a single Naira.

### The Attack Vector

1. **Step 1:** The attacker initiates a legitimate NGN 100 tip for **Creator A** (an account the attacker controls).
2. **Step 2:** The attacker pays NGN 100 on the Flutterwave checkout, completing the transaction. They receive a valid, successful transaction ID from Flutterwave (e.g., `999999`).
3. **Step 3:** The attacker verifies the tip for Creator A. The database is updated: the tip's `flutterwaveTransactionId` is set to `"999999"`, and its status becomes `"VERIFIED"`.
4. **Step 4 (The Exploit):** The attacker now navigates to the success page of **Creator B** (the victim) using Creator A's verified transaction ID:
   ```
   /tip/creator-b/success?transaction_id=999999&status=successful
   ```
5. **Step 5 (Code Execution):**
   Let's look at `app/tip/[slug]/success/page.tsx` line 49–60:
   ```ts
   const existing = await prisma.tip.findUnique({
     where: { flutterwaveTransactionId: transaction_id }, // Looks up "999999"
   })

   if (existing) {
     tip = {
       amount: existing.amount,
       currency: existing.currency,
       tipperName: existing.tipperName,
       message: existing.message,
       createdAt: existing.createdAt.toISOString(),
     }
   }
   ```
   * The database finds the record for **Creator A's tip** because its `flutterwaveTransactionId` matches `"999999"`.
   * **Crucial Logic Flaw:** The code **completely skips** the `else` block (which performs verification and database updates). It does **not** check whether `existing.creatorId` matches **Creator B's ID**!
   * The server-rendered page successfully builds and renders the receipt block:
     ```ts
     return (
       <div>
         <h1>Payment confirmed!</h1>
         <p>Your tip to {creator.displayName} has been sent.</p> <!-- Displays Creator B! -->
         ...
         <dd className="font-medium">{creator.displayName}</dd> <!-- Displays Creator B! -->
         ...
         <dd className="font-medium text-green-600">Verified ✓</dd>
       </div>
     )
     ```

### Impact & Severity: Medium (Visual Spoofing / Social Engineering)
* **What it does not do:** It does **not** credit Creator B's database record or dashboard stats. Creator B's actual earnings remain unchanged.
* **What it does do:** It generates a 100% genuine-looking success screen and receipt claiming that a payment was successfully sent and verified to **Creator B**. An attacker can screenshot this page or show it to Creator B as "proof of payment" to obtain goods, services, or premium content access, bypassing actual payment.

---

## 3. The Vulnerability: Cross-Creator Verification (Race Condition / First-time Verification)

There is a secondary issue if the transaction has **not** been verified yet.

If the attacker pays NGN 100 to **Creator A** (`tx_ref: tip-A`) but intercepts the redirect and instead loads:
```
/tip/creator-b/success?transaction_id=999999&status=successful
```

### The Code Execution:
1. `existing` is null (since `999999` is not in the database yet).
2. The server calls `verifyTransaction("999999")` -> succeeds and returns `tx_ref: tip-A` and `amount: 100`.
3. The server retrieves `tip-A` from the database.
4. **Crucial Logic Flaw:** The server does **not** validate whether `tipRecord.creatorId` matches **Creator B's ID** (`creator.id` looked up from the URL slug).
5. The server updates `tip-A` to `VERIFIED` and sets its `flutterwaveTransactionId` to `"999999"`.
6. The success page of **Creator B** renders a successful receipt showing Creator B's name, but in the database, **Creator A** got credited!

---

## 4. Remediation Plan

To plug these security gaps, we must enforce a strict **ownership contract**: during both the idempotency check and the transaction verification, the server must validate that the tip record belongs to the creator matching the URL slug.

### Step-by-Step Fixes

1. **Verify Creator Ownership on Idempotency Lookup:** If a transaction is already verified, ensure that the verified record matches the current creator's ID. If it does not, reject the request.
2. **Verify Creator Ownership on Database Lookup:** When looking up the pending record by `txRef`, ensure `tipRecord.creatorId === creator.id`.

### Code Remediation for `app/tip/[slug]/success/page.tsx`

```diff
     const existing = await prisma.tip.findUnique({
       where: { flutterwaveTransactionId: transaction_id },
     })
 
-    if (existing) {
+    if (existing) {
+      // Validate that the existing transaction actually belongs to this creator
+      if (existing.creatorId !== creator.id) {
+        throw new Error("Transaction does not belong to this creator")
+      }
       tip = {
         amount: existing.amount,
         currency: existing.currency,
         tipperName: existing.tipperName,
         message: existing.message,
         createdAt: existing.createdAt.toISOString(),
       }
     } else {
       const tipRecord = await prisma.tip.findUnique({
         where: { txRef: transaction.tx_ref },
       })
 
       if (!tipRecord) {
         throw new Error("Transaction reference not found")
       }
 
+      // Validate that the pending record actually belongs to this creator
+      if (tipRecord.creatorId !== creator.id) {
+        throw new Error("Transaction reference mismatch for this creator")
+      }
+
       if (transaction.amount < tipRecord.amount) {
         throw new Error("Amount mismatch")
       }
```

### Code Remediation for `app/api/tip/verify/route.ts`

```diff
+    const creator = await prisma.user.findUnique({
+      where: { slug },
+    })
+
+    if (!creator) {
+      return NextResponse.json(
+        { verified: false, error: "Creator not found" },
+        { status: 404 }
+      )
+    }
+
     const existing = await prisma.tip.findUnique({
       where: { flutterwaveTransactionId: transactionId },
     })
 
     if (existing) {
+      // Validate that the existing transaction actually belongs to this creator
+      if (existing.creatorId !== creator.id) {
+        return NextResponse.json(
+          { verified: false, error: "Transaction does not belong to this creator" },
+          { status: 400 }
+        )
+      }
       return NextResponse.json({
         verified: true,
         tip: {
           amount: existing.amount,
           currency: existing.currency,
           tipperName: existing.tipperName,
           message: existing.message,
           createdAt: existing.createdAt.toISOString(),
         },
       })
     }
 
     ...
 
     const tipRecord = await prisma.tip.findUnique({
       where: { txRef: transaction.tx_ref },
     })
 
     if (!tipRecord) {
       return NextResponse.json(
         { verified: false, error: "Transaction not found" },
         { status: 404 }
       )
     }
 
+    // Validate that the pending record actually belongs to this creator
+    if (tipRecord.creatorId !== creator.id) {
+      return NextResponse.json(
+        { verified: false, error: "Transaction reference mismatch" },
+        { status: 400 }
+      )
+    }
+
     if (transaction.amount < tipRecord.amount) {
```

---

## 5. Security Checklist Summary

| Attack | DB Status (Dashboard) | Client Receipt Status (UI) | Vulnerable Code Location | Key Defense / Fix |
|---|---|---|---|---|
| **Fake transaction ID** | Blocked | Blocked (Shows Error) | N/A | Flutterwave verify API returns error. |
| **Double callback** | Blocked | Blocked (Shows Receipt) | N/A | Unique DB constraint + Idempotency lookup. |
| **Amount manipulation** | Blocked | Blocked (Shows Error) | N/A | Server-side re-comparison (`amount >= tipRecord.amount`). |
| **Replayed Transaction Spoofing** | **Blocked** | **VULNERABLE (Bypassed)** | `success/page.tsx` line 53 | **Fix:** Assert `existing.creatorId === creator.id` during idempotency checks. |
| **Cross-Creator Verification** | **Creator A Credited** | **VULNERABLE (Bypassed)** | `success/page.tsx` line 66 | **Fix:** Assert `tipRecord.creatorId === creator.id` before DB updates. |
