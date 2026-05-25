# Environment Variables

Create `.env.local` in the project root with these variables. Never commit this file.

```bash
# ── Database ──────────────────────────────────────────────────────────────────

# SQLite (local dev)
DATABASE_URL="file:./dev.db"

# Supabase Postgres (production) — replace the above with:
# DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?pgbouncer=true"
# DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"


# ── NextAuth ──────────────────────────────────────────────────────────────────

NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
# In production: NEXTAUTH_URL="https://your-domain.vercel.app"


# ── Flutterwave ───────────────────────────────────────────────────────────────

# Test keys — from Flutterwave dashboard → Settings → API Keys → Test Mode
FLUTTERWAVE_SECRET_KEY="FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X"

# Public key — only needed if using Flutterwave Inline JS SDK instead of Standard
# NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY="FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-X"

# Optional: for webhook signature verification
# FLUTTERWAVE_WEBHOOK_SECRET="your-webhook-secret-from-dashboard"


# ── App ───────────────────────────────────────────────────────────────────────

# Used to build the redirect_url for Flutterwave
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
# In production: NEXT_PUBLIC_BASE_URL="https://your-domain.vercel.app"
```

---

## Variable usage map

| Variable | Used in | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma client | Server-side only |
| `NEXTAUTH_SECRET` | NextAuth | Server-side only — must be long random string |
| `NEXTAUTH_URL` | NextAuth | Must match deployed URL in production |
| `FLUTTERWAVE_SECRET_KEY` | `lib/flutterwave.ts` | **Server-side only — never prefix with NEXT_PUBLIC_** |
| `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | Client SDK only | Only needed for Inline JS method |
| `NEXT_PUBLIC_BASE_URL` | `/api/tip/initiate` | Builds `redirect_url` for FLW |

---

## Generating NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

Or use: https://generate-secret.vercel.app/32
