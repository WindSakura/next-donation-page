export interface CheckoutSessionData {
  status: 'paid' | 'unpaid' | 'no_payment_required'
  sessionStatus: 'open' | 'complete' | 'expired' | null
  amountTotal: number | null
  currency: string | null
}

export type PaymentStatusCategory =
  | 'paid'
  | 'processing'
  | 'incomplete'
  | 'no_payment_required'
  | 'expired'

export function parseCheckoutSessionResponse(data: unknown): CheckoutSessionData | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }
  const obj = data as Record<string, unknown>
  if (
    typeof obj.status !== 'string' ||
    (obj.status !== 'paid' && obj.status !== 'unpaid' && obj.status !== 'no_payment_required')
  ) {
    return null
  }

  const sessionStatus =
    typeof obj.sessionStatus === 'string' &&
    (obj.sessionStatus === 'open' || obj.sessionStatus === 'complete' || obj.sessionStatus === 'expired')
      ? obj.sessionStatus
      : null

  const amountTotal =
    typeof obj.amountTotal === 'number' && Number.isFinite(obj.amountTotal)
      ? obj.amountTotal
      : null

  const currency = typeof obj.currency === 'string' ? obj.currency.toUpperCase() : null

  return {
    status: obj.status,
    sessionStatus,
    amountTotal,
    currency,
  }
}

export function classifySession(data: CheckoutSessionData): PaymentStatusCategory {
  if (data.status === 'paid') {
    return 'paid'
  }
  if (data.status === 'no_payment_required') {
    return 'no_payment_required'
  }
  if (data.sessionStatus === 'expired') {
    return 'expired'
  }
  if (data.status === 'unpaid' && data.sessionStatus === 'complete') {
    return 'processing'
  }
  return 'incomplete'
}

export function formatAmount(amountTotal: number | null, currency: string | null): string {
  if (amountTotal === null) {
    return '--'
  }
  const formatted = (amountTotal / 100).toFixed(2)
  return currency ? `${formatted} ${currency}` : formatted
}