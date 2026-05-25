const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY!
const FLW_BASE = "https://api.flutterwave.com/v3"

export interface InitiatePaymentPayload {
  txRef: string
  amount: number
  email: string
  name: string
  redirectUrl: string
  title: string
  description: string
  meta?: Record<string, unknown>
}

export async function initiatePayment(payload: InitiatePaymentPayload): Promise<string> {
  const res = await fetch(`${FLW_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FLW_SECRET}`,
    },
    body: JSON.stringify({
      tx_ref: payload.txRef,
      amount: payload.amount,
      currency: "NGN",
      redirect_url: payload.redirectUrl,
      customer: {
        email: payload.email,
        name: payload.name,
      },
      customizations: {
        title: payload.title,
        description: payload.description,
      },
      meta: payload.meta,
    }),
  })

  const data = await res.json()

  if (data.status !== "success") {
    throw new Error(data.message || "Failed to initiate payment")
  }

  return data.data.link as string
}

export interface FlwTransaction {
  id: number
  tx_ref: string
  flw_ref: string
  amount: number
  charged_amount: number
  currency: string
  status: string
  payment_type: string
  customer: {
    id: number
    name: string
    email: string
  }
  meta: {
    creatorId?: string
    message?: string
  }
}

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
