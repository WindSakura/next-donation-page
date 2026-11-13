import { getStripe } from '@/lib/server/stripe'
import { paymentError, paymentJson } from '@/lib/server/payment-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const sessionId = new URL(req.url).searchParams.get('session_id')
    if (!sessionId || !/^cs_(?:test|live)_[a-zA-Z0-9]{10,240}$/.test(sessionId)) {
      return paymentJson({ code: 'INVALID_SESSION_ID', error: '支付记录链接缺失或格式不正确。' }, 400)
    }
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    return paymentJson({
      status: session.payment_status,
      sessionStatus: session.status,
      amountTotal: session.amount_total,
      currency: session.currency,
    })
  } catch (error: unknown) {
    return paymentError(error)
  }
}
