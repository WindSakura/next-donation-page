import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { PaymentConfigurationError } from './stripe'

export function paymentJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

export function paymentError(error: unknown) {
  if (error instanceof PaymentConfigurationError) {
    console.error('[payments] Payment configuration is incomplete.')
    return paymentJson({ code: 'PAYMENT_UNAVAILABLE', error: '支付服务暂未配置完成，请稍后再试。' }, 503)
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    if (error.code === 'resource_missing') {
      return paymentJson({ code: 'SESSION_NOT_FOUND', error: '找不到这笔支付记录，请检查返回链接。' }, 404)
    }
    if (error.code === 'amount_too_small') {
      return paymentJson({
        code: 'AMOUNT_TOO_SMALL',
        error: '此金额未达到支付渠道的最低要求，请提高金额后重试。',
      }, 400)
    }
    return paymentJson({ code: 'INVALID_PAYMENT', error: '支付请求无法处理，请检查金额和币种后重试。' }, 400)
  }
  if (error instanceof Stripe.errors.StripeIdempotencyError) {
    return paymentJson({ code: 'PAYMENT_CONFLICT', error: '支付请求已变更，请返回修改金额后重试。' }, 409)
  }
  // Log only operational metadata; Stripe error messages can contain customer data.
  console.error('[payments] Provider request failed.', {
    type: error instanceof Stripe.errors.StripeError ? error.type : 'UnknownError',
    requestId: error instanceof Stripe.errors.StripeError ? error.requestId : undefined,
  })
  return paymentJson({ code: 'PAYMENT_UNAVAILABLE', error: '暂时无法连接支付服务，请稍后重试。' }, 502)
}
