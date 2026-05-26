import { z } from "zod"

export const initiatePaymentSchema = z.object({
  creatorSlug: z.string().min(1, "creatorSlug is required"),
  tipperName: z.string().optional(),
  tipperEmail: z.string().email("Invalid email address"),
  amount: z.number().int().min(100, "Amount must be at least 100 NGN"),
  message: z.string().optional(),
})

export const verifyPaymentSchema = z.object({
  transaction_id: z.string().min(1, "transaction_id is required"),
})

export const successSearchParamsSchema = z.object({
  transaction_id: z.string().min(1, "transaction_id is required"),
  status: z.string().optional(),
  tx_ref: z.string().optional(),
})

export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>
