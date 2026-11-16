'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CheckoutElementsProvider,
  ContactDetailsElement,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout'
import type {
  Stripe,
  StripeCheckoutExpressCheckoutElementOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from '@stripe/stripe-js'
import { AlertCircle, Loader2, LockKeyhole, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCheckoutAppearance } from '@/lib/stripe-appearance'

interface DonationCheckoutProps {
  stripe: Promise<Stripe | null>
  clientSecret: string
  onComplete: () => void
}

function CheckoutFields({
  onComplete,
  onRetry,
}: {
  onComplete: () => void
  onRetry: () => void
}) {
  const state = useCheckoutElements()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentReady, setPaymentReady] = useState(false)
  const [contactReady, setContactReady] = useState(false)
  const [hasWallets, setHasWallets] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const completedRef = useRef(false)
  const mountedRef = useRef(false)
  const ready = state.type === 'success' && paymentReady && contactReady
  const sessionComplete = state.type === 'success' && state.checkout.status.type === 'complete'
  const sessionExpired = state.type === 'success' && state.checkout.status.type === 'expired'

  const expressCheckoutOptions = useMemo<StripeCheckoutExpressCheckoutElementOptions>(
    () => ({
      paymentMethodOrder: ['link'],
      layout: { overflow: 'never' },
      buttonHeight: undefined,
      buttonTheme: undefined,
      buttonType: undefined,
      paymentMethods: undefined,
    }),
    [],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (sessionComplete && !completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }, [sessionComplete, onComplete])

  useEffect(() => {
    if (ready || state.type === 'error' || loadError) return
    const timeout = setTimeout(() => setLoadError(true), 25_000)
    return () => clearTimeout(timeout)
  }, [ready, state.type, loadError])

  async function confirmPayment(walletEvent?: StripeExpressCheckoutElementConfirmEvent) {
    if (state.type !== 'success' || state.checkout.status.type !== 'open' ||
        !mountedRef.current || submittingRef.current || completedRef.current) {
      walletEvent?.paymentFailed({ reason: 'fail' })
      return
    }
    submittingRef.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await state.checkout.confirm({
        redirect: 'if_required',
        ...(walletEvent ? { expressCheckoutConfirmEvent: walletEvent } : {}),
      })
      if (!mountedRef.current) return
      if (result.type === 'error') {
        setError(result.error.message)
        walletEvent?.paymentFailed({ reason: 'fail', message: result.error.message })
      } else {
        // The destination verifies payment server-side, including delayed methods.
        if (!completedRef.current) {
          completedRef.current = true
          onComplete()
        }
      }
    } catch {
      if (!mountedRef.current) return
      setError('暂时无法确认支付，请检查网络后重试。')
      walletEvent?.paymentFailed({ reason: 'fail' })
    } finally {
      if (mountedRef.current && !completedRef.current) {
        submittingRef.current = false
        setIsSubmitting(false)
      }
    }
  }

  if (state.type === 'error' || loadError) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/25 bg-destructive/10 p-5">
        <p role="alert" className="flex items-start gap-2.5 text-sm text-foreground leading-relaxed">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span>支付表单未能加载，请检查网络或浏览器拦截设置后重试。</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重新加载支付表单
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {!ready && (
        <div role="status" className="flex items-center gap-2.5 p-3.5 rounded-xl border border-border/60 bg-muted/30 text-xs sm:text-sm text-muted-foreground animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-primary shrink-0" aria-hidden="true" />
          <span>正在准备安全支付表单…</span>
        </div>
      )}
      {/* Mount Elements while actions load: they are part of SDK initialization. */}
      <div className={hasWallets ? 'space-y-3' : ''}>
        <ExpressCheckoutElement
          options={expressCheckoutOptions}
          onConfirm={(event) => { void confirmPayment(event) }}
          onReady={({ availablePaymentMethods }) => {
            setHasWallets(Boolean(availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean)))
          }}
          onAvailablePaymentMethodsChange={({ paymentMethods }) => {
            setHasWallets(Boolean(paymentMethods && Object.values(paymentMethods).some((method) => method?.available)))
          }}
          onLoadError={() => setHasWallets(false)}
        />
        {hasWallets && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground py-1 select-none" aria-hidden="true">
            <span className="h-px flex-1 bg-border/70" />
            <span>或使用其他支付方式</span>
            <span className="h-px flex-1 bg-border/70" />
          </div>
        )}
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (ready && !sessionExpired) void confirmPayment()
        }}
        className="space-y-5"
        aria-label="赞助支付"
        aria-busy={isSubmitting}
      >
        <ContactDetailsElement
          onReady={() => setContactReady(true)}
          onLoadError={() => setLoadError(true)}
        />
        <PaymentElement
          options={{ layout: 'accordion' }}
          onReady={() => setPaymentReady(true)}
          onLoadError={() => setLoadError(true)}
        />
        {error && (
          <div role="alert" className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-xs sm:text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}
        {sessionExpired && (
          <div role="alert" className="p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-xs sm:text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span className="leading-relaxed">这笔支付会话已过期，请返回修改金额后重新发起赞助。</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={!ready || isSubmitting || sessionExpired || sessionComplete}
          className="h-12 w-full gap-2 text-sm sm:text-base font-semibold shadow-lg"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
          ) : (
            <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {isSubmitting
            ? '正在确认支付…'
            : state.type === 'success'
              ? `确认赞助 ${state.checkout.total.total.amount}`
              : '正在加载支付方式…'}
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground select-none">
          支付信息由 Stripe 安全处理，本站不存储卡号
        </p>
      </form>
    </div>
  )
}

export function DonationCheckout({ stripe, clientSecret, onComplete }: DonationCheckoutProps) {
  const { resolvedTheme } = useTheme()
  const [retry, setRetry] = useState(0)
  const appearance = useMemo(
    () => getCheckoutAppearance(resolvedTheme === 'dark' ? 'dark' : 'light'),
    [resolvedTheme],
  )
  const options = useMemo(() => ({
    clientSecret,
    elementsOptions: { appearance },
  }), [clientSecret, appearance])

  return (
    <div className="p-4 sm:p-6 lg:p-7">
      {/* Theme updates call changeAppearance; only explicit load retries remount. */}
      <CheckoutElementsProvider key={`${clientSecret}:${retry}`} stripe={stripe} options={options}>
        <CheckoutFields onComplete={onComplete} onRetry={() => setRetry((value) => value + 1)} />
      </CheckoutElementsProvider>
    </div>
  )
}
