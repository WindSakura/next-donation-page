import Stripe from 'stripe'

let client: Stripe | undefined

export class PaymentConfigurationError extends Error {}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new PaymentConfigurationError('Missing STRIPE_SECRET_KEY')
  }
  client ??= new Stripe(key, {
    // Match stripe@23.1.0's types and keep protocol changes explicit on upgrades.
    apiVersion: '2026-10-28.endive',
    timeout: 15_000,
    maxNetworkRetries: 1,
  })
  return client
}

export function getAppOrigin(): string {
  const configured = process.env.APP_URL || 'https://donate.yakum0.moe'
  try {
    const url = new URL(configured)
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
      throw new Error('APP_URL must use HTTPS outside localhost')
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('APP_URL must be a plain origin')
    }
    return url.origin
  } catch {
    throw new PaymentConfigurationError('Invalid APP_URL')
  }
}
