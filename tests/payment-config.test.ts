import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppOrigin, getStripe, PaymentConfigurationError } from '../src/lib/server/stripe'

afterEach(() => vi.unstubAllEnvs())

describe('payment configuration', () => {
  it('supports a local development origin', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000')
    expect(getAppOrigin()).toBe('http://localhost:3000')
  })
  it.each(['http://donate.example', 'javascript:alert(1)', 'https://user@donate.example', 'https://donate.example/path', 'https://donate.example/?secret=1'])(
    'rejects unsafe or ambiguous APP_URL %s', (url) => {
      vi.stubEnv('APP_URL', url)
      expect(() => getAppOrigin()).toThrow(PaymentConfigurationError)
    },
  )
  it('uses the existing production domain as a compatible default', () => {
    vi.stubEnv('APP_URL', '')
    expect(getAppOrigin()).toBe('https://donate.yakum0.moe')
  })
  it('fails lazily and clearly when the secret key is missing', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    expect(() => getStripe()).toThrow(PaymentConfigurationError)
  })
})
