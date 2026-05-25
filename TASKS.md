# Build Tasks

Phased checklist. Each phase should be shippable before moving to the next.

---

## Phase 0 — Project setup

- [ ] `npx create-next-app@latest hustle-receipt --typescript --tailwind --app`
- [ ] Install dependencies:
  ```bash
  npm install prisma @prisma/client next-auth @auth/prisma-adapter
  npm install @tanstack/react-query @tanstack/react-query-devtools
  npm install bcryptjs
  npm install -D @types/bcryptjs
  npx prisma init
  ```
- [ ] Create `.env.local` with all variables from `ENV.md`
- [ ] Set up Prisma schema (see `DATABASE.md`)
- [ ] Run `npx prisma migrate dev --name init`
- [ ] Verify DB with `npx prisma studio`

---

## Phase 1 — Auth (reuse from Task 1 or rebuild)

- [ ] `lib/auth.ts` — NextAuth config with Prisma adapter
- [ ] `app/api/auth/[...nextauth]/route.ts`
- [ ] `app/(auth)/login/page.tsx` — login form
- [ ] `app/(auth)/signup/page.tsx` — signup form, creates user + slug
- [ ] Slug generation utility (e.g. `slugify(displayName) + random suffix`)
- [ ] `lib/prisma.ts` — singleton client
- [ ] Test: sign up → log in → session persists

---

## Phase 2 — Public tip page

- [ ] `app/tip/[slug]/page.tsx` — fetches creator by slug (server component)
- [ ] `components/TipForm.tsx` — client component with controlled inputs
  - Name (optional text input)
  - Email (required)
  - Amount (number input, NGN)
  - Message (optional textarea)
  - Submit button with loading state
- [ ] `app/api/tip/initiate/route.ts`
  - Validate inputs
  - Look up creator by slug
  - Generate `txRef`
  - Create `Tip` record with status `PENDING`
  - Call `initiatePayment()` from `lib/flutterwave.ts`
  - Return `{ checkoutUrl }`
- [ ] `lib/flutterwave.ts` — `initiatePayment()` function
- [ ] `TipForm` redirects browser to `checkoutUrl` on success
- [ ] Test: fill form → land on Flutterwave checkout → pay with test card

---

## Phase 3 — Payment verification

- [ ] `app/tip/[slug]/success/page.tsx`
  - Read `transaction_id`, `tx_ref`, `status` from searchParams
  - Call `verifyAndSaveTip()` (can be a server action or API call)
  - Show receipt on verified, error state on failure
- [ ] `app/api/tip/verify/route.ts`
  - Call `verifyTransaction(transactionId)` from `lib/flutterwave.ts`
  - Validate: status, currency, amount vs DB record
  - Check for duplicate (idempotency)
  - Update tip record: status `VERIFIED`, set `flutterwaveTransactionId`, `verifiedAt`
  - Return `{ verified, tip }`
- [ ] `lib/flutterwave.ts` — add `verifyTransaction()` function
- [ ] Test: complete test payment → success page shows receipt → DB record updated

---

## Phase 4 — Creator dashboard

- [ ] `app/api/dashboard/route.ts`
  - Auth check (return 401 if no session)
  - Aggregate: total amount, tip count (verified only)
  - Recent tips (latest 20, verified)
  - Message wall (all tips with messages)
- [ ] `app/providers.tsx` — `QueryClientProvider` wrapper (client component)
- [ ] Update `app/layout.tsx` to wrap with `Providers`
- [ ] `app/dashboard/page.tsx` — protected page, uses React Query
- [ ] `components/DashboardStats.tsx` — total tips card, count card
- [ ] `components/RecentTips.tsx` — table/list of recent tips
- [ ] `components/MessageWall.tsx` — masonry or grid of tipper messages
- [ ] React Query config:
  ```ts
  useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  })
  ```
- [ ] Test: verify a tip → dashboard shows it within 5 minutes (or on tab switch)

---

## Phase 5 — Polish and edge cases

- [ ] Empty states: no tips yet, creator not found (404)
- [ ] Error states: payment failed, verification failed
- [ ] Loading skeletons on dashboard
- [ ] Mobile-responsive tip form and dashboard
- [ ] `og:image` and `og:title` meta for `/tip/[slug]` (shareable link preview)
- [ ] Input validation with Zod on API routes
- [ ] Rate limiting on `/api/tip/initiate` (basic — prevent spam)
- [ ] `NEXT_PUBLIC_BASE_URL` used correctly for redirect URL construction

---

## Phase 6 — Production (optional)

- [ ] Switch DB to Supabase Postgres (see `DATABASE.md`)
- [ ] Deploy to Vercel
- [ ] Set all env vars in Vercel dashboard
- [ ] Switch Flutterwave to live keys (after business verification)
- [ ] Add webhook endpoint for reliable verification
