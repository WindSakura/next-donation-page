import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
}))

// Exercise the real SDK's serialization and error parsing with no network calls.
vi.mock('stripe', async (importOriginal) => {
  const { default: Stripe } = await importOriginal<typeof import('stripe')>()
  return {
    default: class extends Stripe {
      constructor(key: string, config?: ConstructorParameters<typeof Stripe>[1]) {
        super(key, {
          ...config,
          telemetry: false,
          httpClient: Stripe.createFetchHttpClient(transport.fetch),
        })
      }
    },
  }
})

const sessionId = 'cs_test_1234567890abcdef'
const idempotencyKey = 'aed77272-8989-4b92-a6ae-9455814a3678'

function providerResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'request-id': 'req_test_sdk_upgrade',
    },
  })
}

async function createSession() {
  const { POST } = await import('../src/app/api/create-checkout-session/route')
  return POST(new Request('https://donate.example/api/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://donate.example',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ amount: '19.99', currency: 'USD' }),
  }))
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('APP_URL', 'https://donate.example')
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_sdk_regression_only')
  transport.fetch.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Stripe SDK transport compatibility', () => {
  it('encodes an embedded donation with the pinned API version and idempotency key', async () => {
    transport.fetch.mockResolvedValue(providerResponse({
      id: sessionId, object: 'checkout.session', client_secret: 'test_client_secret',
    }))

    const response = await createSession()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ clientSecret: 'test_client_secret', sessionId })
    expect(transport.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = transport.fetch.mock.calls[0]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(options?.method).toBe('POST')
    const headers = new Headers(options?.headers)
    expect(headers.get('stripe-version')).toBe('2026-10-28.endive')
    expect(headers.get('idempotency-key')).toBe(`donation-${idempotencyKey}`)
    expect(typeof options?.body).toBe('string')
    const params = new URLSearchParams(String(options?.body))
    expect(params.get('ui_mode')).toBe('embedded_page')
    expect(params.get('mode')).toBe('payment')
    expect(params.get('submit_type')).toBe('donate')
    expect(params.get('line_items[0][price_data][unit_amount]')).toBe('1999')
    expect(params.get('line_items[0][price_data][currency]')).toBe('usd')
    expect(params.get('return_url')).toBe('https://donate.example/success?session_id={CHECKOUT_SESSION_ID}')
  })

  it('retrieves a paid session through the SDK without returning customer details', async () => {
    transport.fetch.mockResolvedValue(providerResponse({
      id: sessionId, object: 'checkout.session', ui_mode: 'embedded_page',
      payment_status: 'paid', status: 'complete', amount_total: 1999, currency: 'usd',
      customer_details: { email: 'private@example.invalid' },
    }))
    const { GET } = await import('../src/app/api/check-checkout/route')
    const response = await GET(new Request(`https://donate.example/api/check-checkout?session_id=${sessionId}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: 'paid', sessionStatus: 'complete', amountTotal: 1999, currency: 'usd',
    })
    const [url, options] = transport.fetch.mock.calls[0]
    expect(url).toBe(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`)
    expect(options?.method).toBe('GET')
    expect(new Headers(options?.headers).get('stripe-version')).toBe('2026-10-28.endive')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each([
    ['invalid_request_error', 'amount_too_small', 400, 400, 'AMOUNT_TOO_SMALL'],
    ['idempotency_error', undefined, 400, 409, 'PAYMENT_CONFLICT'],
    ['authentication_error', undefined, 401, 502, 'PAYMENT_UNAVAILABLE'],
  ] as const)('maps a provider %s response through the SDK to a safe API error', async (type, code, providerStatus, status, expectedCode) => {
    transport.fetch.mockResolvedValue(providerResponse({
      error: { type, code, message: 'private_provider_detail' },
    }, providerStatus))
    const response = await createSession()
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body.code).toBe(expectedCode)
    expect(JSON.stringify(body)).not.toContain('private_provider_detail')
    expect(transport.fetch).toHaveBeenCalledTimes(1)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
