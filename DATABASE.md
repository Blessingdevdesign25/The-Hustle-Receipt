# Database

Prisma with SQLite for local development. Swap `datasource db` to Supabase Postgres for production with no schema changes.

---

## Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"           // change to "postgresql" for Supabase
  url      = env("DATABASE_URL")
}

// ── Auth ──────────────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  password      String                          // bcrypt hash
  displayName   String
  slug          String    @unique               // URL-safe, e.g. "victor-dev"
  bio           String?
  avatarUrl     String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  tips          Tip[]                           // tips received by this creator
  sessions      Session[]
  accounts      Account[]

  @@map("users")
}

// NextAuth adapter tables (required if using @auth/prisma-adapter)
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ── Tips ──────────────────────────────────────────────────────────────────────

model Tip {
  id                      String   @id @default(cuid())
  creatorId               String
  creator                 User     @relation(fields: [creatorId], references: [id])

  // Tipper info (all optional/anonymous-friendly)
  tipperName              String?
  tipperEmail             String?

  // Payment details
  amount                  Float                         // in Naira
  currency                String   @default("NGN")
  message                 String?

  // Flutterwave tracking
  txRef                   String   @unique              // our reference (tip-timestamp-random)
  flutterwaveTransactionId String? @unique              // FLW's transaction ID — set on verify
  status                  TipStatus @default(PENDING)

  createdAt               DateTime @default(now())
  verifiedAt              DateTime?

  @@index([creatorId])
  @@index([status])
  @@map("tips")
}

enum TipStatus {
  PENDING     // initiation created, payment not yet confirmed
  VERIFIED    // Flutterwave confirmed, saved to DB
  FAILED      // verification came back unsuccessful
}
```

---

## Data access patterns

### Initiate a tip (create pending record)
```ts
// lib/prisma.ts exports singleton `prisma`
const tip = await prisma.tip.create({
  data: {
    creatorId: creator.id,
    tipperName: body.tipperName,
    tipperEmail: body.tipperEmail,
    amount: body.amount,
    message: body.message,
    txRef,                          // store before redirecting to FLW
    status: 'PENDING',
  },
})
```

### Verify and update tip
```ts
const tip = await prisma.tip.update({
  where: { txRef },
  data: {
    flutterwaveTransactionId: String(flwData.id),
    status: 'VERIFIED',
    verifiedAt: new Date(),
  },
})
```

### Dashboard aggregation
```ts
const [aggregate, recentTips] = await Promise.all([
  prisma.tip.aggregate({
    where: { creatorId, status: 'VERIFIED' },
    _sum: { amount: true },
    _count: true,
  }),
  prisma.tip.findMany({
    where: { creatorId, status: 'VERIFIED' },
    orderBy: { verifiedAt: 'desc' },
    take: 20,
    select: {
      id: true, amount: true, tipperName: true, message: true, verifiedAt: true,
    },
  }),
])
```

### Guard against double-save (idempotency)
```ts
const existing = await prisma.tip.findUnique({
  where: { flutterwaveTransactionId: String(flwTransactionId) },
})
if (existing) return existing  // already verified — return cached result
```

---

## Migrations

```bash
# local dev
npx prisma migrate dev --name init

# prod (Supabase)
# 1. Update DATABASE_URL in .env to Supabase Postgres connection string
# 2. Run:
npx prisma migrate deploy
```

---

## Supabase swap (production)

1. Create a Supabase project
2. Copy the **Postgres connection string** (with `?pgbouncer=true` for pooling) into `DATABASE_URL`
3. Add a direct URL `DIRECT_URL` (without pgbouncer) and update `schema.prisma`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")   // needed for migrations
}
```
4. Change `TipStatus` enum — SQLite doesn't support native enums, Postgres does. The schema above works for both if you use `String` for SQLite and switch to the `enum` declaration for Postgres.
