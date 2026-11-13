import { describe, expect, it } from 'vitest'
import { classifySession, parseCheckoutSessionResponse } from '../src/components/checkout-status'

describe('payment result presentation', () => {
  it.each([
    ['paid', 'complete', 'paid'],
    ['unpaid', 'complete', 'processing'],
    ['unpaid', 'open', 'incomplete'],
    ['unpaid', 'expired', 'expired'],
    ['unpaid', null, 'incomplete'],
    ['no_payment_required', 'complete', 'no_payment_required'],
  ] as const)('classifies %s / %s as %s', (status, sessionStatus, expected) => {
    expect(classifySession({ status, sessionStatus, amountTotal: 1999, currency: 'USD' })).toBe(expected)
  })

  it.each([null, {}, { status: 'success' }, { payment_intent_client_secret: 'arbitrary' }])(
    'does not accept an unverified success signal %j', (value) => {
      expect(parseCheckoutSessionResponse(value)).toBeNull()
    },
  )
})
