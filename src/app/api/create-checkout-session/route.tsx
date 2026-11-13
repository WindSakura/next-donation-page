import { randomUUID } from 'node:crypto'
import { DonationValidationError, isDonationCurrency, parseDonationAmount } from '@/lib/donation'
import { getAppOrigin, getStripe } from '@/lib/server/stripe'
import { paymentError, paymentJson } from '@/lib/server/payment-response'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const origin = getAppOrigin()
    const requestOrigin = req.headers.get('origin')
    if (requestOrigin && requestOrigin !== origin) {
      return paymentJson({ code: 'INVALID_ORIGIN', error: '请从本站发起支付。' }, 403)
    }
    if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return paymentJson({ code: 'INVALID_CONTENT_TYPE', error: '请使用 JSON 提交支付请求。' }, 415)
    }
    let body: unknown
    try {
      const raw = await req.text()
      if (raw.length > 1024) {
        return paymentJson({ code: 'INVALID_REQUEST', error: '支付请求过长。' }, 413)
      }
      body = JSON.parse(raw)
    } catch {
      return paymentJson({ code: 'INVALID_JSON', error: '支付请求格式不正确。' }, 400)
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body) ||
        !('amount' in body) || !('currency' in body)) {
      return paymentJson({ code: 'INVALID_REQUEST', error: '请提供金额和币种。' }, 400)
    }
    const minorUnits = parseDonationAmount(body.amount, body.currency)
    if (!isDonationCurrency(body.currency)) {
      return paymentJson({ code: 'INVALID_CURRENCY', error: '请选择支持的币种。' }, 400)
    }
    const key = req.headers.get('idempotency-key') ?? randomUUID()
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) {
      return paymentJson({ code: 'INVALID_REQUEST_ID', error: '支付请求标识无效，请刷新页面后重试。' }, 400)
    }
    const session = await getStripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      line_items: [{
        price_data: {
          currency: body.currency.toLowerCase(),
          product_data: { name: '支持 DLsite 战队' },
          unit_amount: minorUnits,
        },
        quantity: 1,
      }],
      mode: 'payment',
      locale: 'zh',
      submit_type: 'donate',
      return_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    }, { idempotencyKey: `donation-${key}` })
    if (!session.client_secret) {
      return paymentJson({ code: 'PAYMENT_UNAVAILABLE', error: '无法加载支付页面，请稍后重试。' }, 502)
    }
    return paymentJson({ clientSecret: session.client_secret, sessionId: session.id })
  } catch (error: unknown) {
    if (error instanceof DonationValidationError) {
      return paymentJson({ code: error.code, error: error.message }, 400)
    }
    return paymentError(error)
  }
}
