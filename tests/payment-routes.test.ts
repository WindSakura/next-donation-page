import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  getStripe: vi.fn(),
}))

vi.mock('@/lib/server/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/server/stripe')>()
  return { ...actual, getStripe: mocks.getStripe }
})

import { POST } from '../src/app/api/create-checkout-session/route'
import { GET } from '../src/app/api/check-checkout/route'
import { PaymentConfigurationError } from '../src/lib/server/stripe'

const sessionId = 'cs_test_1234567890abcdef'
const idempotencyKey = 'aed77272-8989-4b92-a6ae-9455814a3678'

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://donate.example/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://donate.example',
      'Idempotency-Key': idempotencyKey,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('APP_URL', 'https://donate.example')
  mocks.create.mockReset().mockResolvedValue({ id: sessionId, client_secret: 'secret_for_test' })
  mocks.retrieve.mockReset().mockResolvedValue({
    payment_status: 'unpaid', status: 'open', customer_details: null,
    amount_total: 1999, currency: 'usd',
  })
  mocks.getStripe.mockReset().mockReturnValue({
    checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } },
  })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('create checkout session', () => {
  it('sends an exact amount, lowercase currency and trusted return URL to Stripe', async () => {
    const response = await POST(request({ amount: '19.99', currency: 'USD' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ clientSecret: 'secret_for_test', sessionId })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({
        price_data: expect.objectContaining({ unit_amount: 1999, currency: 'usd' }),
      })],
      return_url: 'https://donate.example/success?session_id={CHECKOUT_SESSION_ID}',
    }), { idempotencyKey: `donation-${idempotencyKey}` })
  })

  it('preserves the idempotency key when the same request is retried', async () => {
    await POST(request({ amount: '10', currency: 'USD' }))
    await POST(request({ amount: '10', currency: 'USD' }))
    expect(mocks.create.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: `donation-${idempotencyKey}` },
      { idempotencyKey: `donation-${idempotencyKey}` },
    ])
  })

  it.each([
    { amount: 1999, currency: 'USD' },
    { amount: '-10', currency: 'USD' },
    { amount: '0', currency: 'USD' },
    { amount: '1.001', currency: 'USD' },
    { amount: '100000.01', currency: 'USD' },
    { amount: '10', currency: 'JPY' },
    { amount: '1', currency: 'HKD' },
    {},
    null,
    [],
  ])('rejects invalid request %j before calling Stripe', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('returns a controlled 400 for malformed JSON', async () => {
    const response = await POST(new Request('https://donate.example/api/create-checkout-session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_JSON' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects cross-origin payment creation', async () => {
    expect((await POST(request({ amount: '10', currency: 'USD' }, { Origin: 'https://attacker.example' }))).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not derive the return URL from a missing Origin header', async () => {
    const req = request({ amount: '10', currency: 'USD' })
    req.headers.delete('origin')
    expect((await POST(req)).status).toBe(200)
    expect(mocks.create.mock.calls[0][0].return_url).toBe('https://donate.example/success?session_id={CHECKOUT_SESSION_ID}')
  })

  it('rejects a non-JSON content type', async () => {
    expect((await POST(request({}, { 'Content-Type': 'text/plain' }))).status).toBe(415)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects oversized JSON and malformed idempotency keys', async () => {
    expect((await POST(request({ padding: 'x'.repeat(1100) }))).status).toBe(413)
    expect((await POST(request({ amount: '10', currency: 'USD' }, { 'Idempotency-Key': 'bad' }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('maps Stripe minimum-charge errors to a visible input error', async () => {
    mocks.create.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error', message: 'Internal provider details', code: 'amount_too_small',
    }))
    const response = await POST(request({ amount: '10', currency: 'USD' }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'AMOUNT_TOO_SMALL' })
  })

  it('returns a safe error instead of exposing provider error text', async () => {
    mocks.create.mockRejectedValue(new Error('secret_internal_detail'))
    const response = await POST(request({ amount: '10', currency: 'USD' }))
    expect(response.status).toBe(502)
    expect(JSON.stringify(await response.json())).not.toContain('secret_internal_detail')
  })

  it('reports unavailable configuration without crashing the route', async () => {
    mocks.getStripe.mockImplementation(() => { throw new PaymentConfigurationError('missing key') })
    expect((await POST(request({ amount: '10', currency: 'USD' }))).status).toBe(503)
  })

  it('rejects a missing client secret instead of returning an unusable checkout', async () => {
    mocks.create.mockResolvedValue({ id: sessionId, client_secret: null })
    expect((await POST(request({ amount: '10', currency: 'USD' }))).status).toBe(502)
  })
})

describe('checkout status', () => {
  it('returns an unpaid session with null customer details without 500 or email exposure', async () => {
    const response = await GET(new Request(`https://donate.example/api/check-checkout?session_id=${sessionId}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'unpaid', sessionStatus: 'open', amountTotal: 1999, currency: 'usd',
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each(['', '?session_id=invalid', '?session_id=cs_test_short'])('rejects malformed session identifiers %s', async (query) => {
    expect((await GET(new Request(`https://donate.example/api/check-checkout${query}`))).status).toBe(400)
    expect(mocks.retrieve).not.toHaveBeenCalled()
  })

  it('returns authoritative paid status without customer information', async () => {
    mocks.retrieve.mockResolvedValue({
      payment_status: 'paid', status: 'complete',
      amount_total: 1000, currency: 'cny', customer_details: { email: 'private@example.invalid' },
    })
    const response = await GET(new Request(`https://donate.example/api/check-checkout?session_id=${sessionId}`))
    expect(await response.json()).toEqual({
      status: 'paid', sessionStatus: 'complete', amountTotal: 1000, currency: 'cny',
    })
  })

  it('preserves delayed-payment state for the result page', async () => {
    mocks.retrieve.mockResolvedValue({
      payment_status: 'unpaid', status: 'complete', amount_total: 1000, currency: 'usd',
    })
    const response = await GET(new Request(`https://donate.example/api/check-checkout?session_id=${sessionId}`))
    expect(await response.json()).toMatchObject({ status: 'unpaid', sessionStatus: 'complete' })
  })

  it('returns 404 for a well-formed but unknown Stripe session', async () => {
    mocks.retrieve.mockRejectedValue(new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error', message: 'No such checkout.session', code: 'resource_missing',
    }))
    expect((await GET(new Request(`https://donate.example/api/check-checkout?session_id=${sessionId}`))).status).toBe(404)
  })
})
