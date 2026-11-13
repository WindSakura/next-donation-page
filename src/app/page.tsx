'use client'

import { useState, useCallback, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js/pure'
import type { Stripe } from '@stripe/stripe-js'
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DONATION_CURRENCIES,
  DEFAULT_CURRENCY,
  type DonationCurrency,
  getCurrencyConfig,
  isDonationCurrency,
  parseDonationAmount,
  DonationValidationError,
  MAX_DONATION_MINOR_UNITS,
} from '@/lib/donation'
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'

const rawPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()

let cachedStripePromise: Promise<Stripe | null> | null = null

function getStripePromise(key: string): Promise<Stripe | null> {
  if (!cachedStripePromise) {
    cachedStripePromise = loadStripe(key).catch((err) => {
      console.error('[stripe] Failed to load Stripe SDK', err)
      cachedStripePromise = null
      throw err
    })
  }
  return cachedStripePromise
}

function waitForStripe(
  promise: Promise<Stripe | null>,
  signal: AbortSignal
): Promise<Stripe | null> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }
    signal.addEventListener('abort', onAbort)

    promise
      .then((res) => {
        cleanup()
        resolve(res)
      })
      .catch((err) => {
        cleanup()
        reject(err)
      })
  })
}

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const part = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  return `req_${part.slice(0, 24)}`
}

export default function DonationPage() {
  const router = useRouter()
  const [currency, setCurrency] = useState<DonationCurrency>(DEFAULT_CURRENCY)
  const currencyConfig = getCurrencyConfig(currency)
  const [amount, setAmount] = useState<string>(currencyConfig.presets[0] ?? '20')
  const [isLoading, setIsLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateRequestId())

  const amountInputId = useId()
  const currencySelectId = useId()
  const amountHintId = useId()

  const abortControllerRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Calculate parsed amount for dynamic button state
  let formattedAmount: string | null = null
  let isAmountValid = false
  let validationMessage: string | null = null

  const trimmedAmount = amount.trim()
  if (trimmedAmount) {
    try {
      const minorUnits = parseDonationAmount(trimmedAmount, currency)
      formattedAmount = (minorUnits / 100).toFixed(2)
      isAmountValid = true
    } catch (err: unknown) {
      if (err instanceof DonationValidationError) {
        validationMessage = err.message
      } else {
        validationMessage = '请输入有效金额'
      }
    }
  }

  const displayAmount = formattedAmount ?? (Number(amount) ? Number(amount).toFixed(2) : amount)

  const handleCurrencyChange = (newVal: string) => {
    if (!isDonationCurrency(newVal)) return
    setCurrency(newVal)
    const newConfig = getCurrencyConfig(newVal)
    try {
      const minor = parseDonationAmount(amount.trim(), newVal)
      if (minor < newConfig.minMinorUnits) {
        setAmount(newConfig.presets[0] ?? '10')
      }
    } catch {
      setAmount(newConfig.presets[0] ?? '10')
    }
    setIdempotencyKey(generateRequestId())
    setErrorMessage(null)
  }

  const handleSelectPreset = (preset: string) => {
    setAmount(preset)
    setIdempotencyKey(generateRequestId())
    setErrorMessage(null)
  }

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value)
    setIdempotencyKey(generateRequestId())
    setErrorMessage(null)
  }

  const handleReturnToEdit = useCallback(() => {
    setClientSecret(null)
    setSessionId(null)
    setErrorMessage(null)
    setIdempotencyKey(generateRequestId())
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    if (!rawPublishableKey) {
      setErrorMessage('在线支付暂不可用，请稍后再试。')
      return
    }

    try {
      parseDonationAmount(amount.trim(), currency)
    } catch (err: unknown) {
      if (err instanceof DonationValidationError) {
        setErrorMessage(err.message)
      } else {
        setErrorMessage('请输入有效金额，最多保留两位小数。')
      }
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    // 35s timeout to accommodate provider processing and 1 server-side retry
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 35000)

    try {
      // Lazy load Stripe and race against the 35s abort signal
      const promise = getStripePromise(rawPublishableKey)
      const stripeInstance = await waitForStripe(promise, controller.signal)

      if (unmountedRef.current || abortControllerRef.current !== controller) return

      if (!stripeInstance) {
        throw new Error('STRIPE_LOAD_FAILED')
      }
      setStripePromise(promise)

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          amount: amount.trim(),
          currency,
        }),
        signal: controller.signal,
      })

      const data: unknown = await res.json().catch(() => null)

      if (unmountedRef.current || abortControllerRef.current !== controller) return

      if (!res.ok) {
        let msg = '创建支付会话失败，请稍后重试。'
        if (
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof data.error === 'string'
        ) {
          msg = data.error
        }
        setErrorMessage(msg)
        return
      }

      if (
        typeof data === 'object' &&
        data !== null &&
        'clientSecret' in data &&
        typeof data.clientSecret === 'string' &&
        'sessionId' in data &&
        typeof data.sessionId === 'string'
      ) {
        setClientSecret(data.clientSecret)
        setSessionId(data.sessionId)
        setErrorMessage(null)
      } else {
        setErrorMessage('支付服务返回了未知的响应格式，请刷新页面后重试。')
      }
    } catch (err: unknown) {
      if (unmountedRef.current || abortControllerRef.current !== controller) return

      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMessage('支付会话建立超时，请检查网络后重试。')
      } else if (err instanceof Error && err.message === 'STRIPE_LOAD_FAILED') {
        setErrorMessage('支付组件加载失败，请检查网络或浏览器拦截插件后重试。')
      } else {
        setErrorMessage('暂时无法连接支付服务，请检查网络后重试。')
      }
    } finally {
      clearTimeout(timeoutId)
      if (!unmountedRef.current && abortControllerRef.current === controller) {
        setIsLoading(false)
      }
    }
  }

  const isConfigMissing = !rawPublishableKey

  const buttonText = isLoading
    ? '正在建立支付连接...'
    : isConfigMissing
      ? '在线支付暂不可用'
      : isAmountValid && formattedAmount
        ? `继续支付 ${currencyConfig.symbol}${formattedAmount}`
        : validationMessage ?? '请输入有效金额'

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 py-6 sm:py-10 lg:py-12 bg-cover bg-center bg-no-repeat bg-[url('/ero.jpg')]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden="true" />

      {clientSecret ? (
        /* 桌面横版宽卡片 / 移动端竖向自适应 */
        <Card className="relative z-10 w-full max-w-lg lg:max-w-6xl xl:max-w-[1180px] bg-card/95 backdrop-blur-md shadow-2xl border border-white/20 rounded-2xl transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8 p-3 sm:p-6 lg:p-8">
            {/* 左列 (桌面宽 320-340px，Sticky 顶部居左；移动端全宽顶部) */}
            <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 space-y-4 lg:sticky lg:top-8 mb-4 lg:mb-0">
              <div className="space-y-1.5 text-center lg:text-left">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  完成赞助支付
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  请在<span className="hidden lg:inline">右侧结账面板</span><span className="lg:hidden">下方</span>完成结账。确认后将自动跳转至支付结果核验页。
                </CardDescription>
              </div>

              {/* 赞助摘要 */}
              <div className="rounded-xl border bg-muted/40 p-4 space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">赞助战队</span>
                  <span className="text-xs font-semibold text-foreground">支持 DLsite 战队</span>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-muted-foreground">赞助金额</span>
                  <div className="text-right">
                    <span className="text-xl sm:text-2xl font-bold text-foreground">
                      {currencyConfig.symbol}{displayAmount}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground font-mono">
                      {currencyConfig.code}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 leading-normal italic pt-2 border-t border-border/40">
                  “我的出租屋里真的有很多蟑螂，但我认识的粥批真的没有几个”
                </p>
              </div>

              {/* 返回修改按钮 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReturnToEdit}
                className="w-full h-9 text-xs sm:text-sm flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回修改金额与币种
              </Button>
            </div>

            {/* 右列 (桌面自适应最大宽 760px；小屏纵向全宽；iframe 自然高度) */}
            <div className="w-full min-w-0 lg:flex-1 lg:max-w-[760px]">
              <div className="w-full rounded-xl overflow-hidden border bg-background/80 shadow-sm">
                {stripePromise ? (
                  <EmbeddedCheckoutProvider
                    stripe={stripePromise}
                    options={{
                      clientSecret,
                      onComplete: () => {
                        if (sessionId) {
                          router.push(`/success?session_id=${encodeURIComponent(sessionId)}`)
                        }
                      },
                    }}
                  >
                    <EmbeddedCheckout className="w-full" />
                  </EmbeddedCheckoutProvider>
                ) : (
                  <div className="p-8 text-center text-destructive text-sm" role="alert">
                    未加载 Stripe 运行环境，无法渲染结账表单。
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* 初始金额表单：保持紧凑居中布局 (max-w-lg) */
        <Card className="relative z-10 w-full max-w-lg bg-card/95 backdrop-blur-md shadow-2xl border border-white/20 rounded-2xl overflow-hidden">
          <CardHeader className="space-y-2 pb-3 sm:pb-4 text-center sm:text-left px-4 sm:px-6">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
              请支持我们的战队，为我们的战队投票
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
              我的出租屋里真的有很多蟑螂，但我认识的粥批真的没有几个
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="space-y-4 sm:space-y-5 px-4 sm:px-6 pt-0">
              {isConfigMissing && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="leading-relaxed">
                    在线支付暂不可用，请稍后再试。
                  </div>
                </div>
              )}

              {/* Currency Selector */}
              <div className="space-y-1.5 sm:space-y-2">
                <label
                  htmlFor={currencySelectId}
                  className="block text-sm font-medium text-foreground"
                >
                  币种 / Currency
                </label>
                <Select value={currency} onValueChange={handleCurrencyChange} disabled={isLoading}>
                  <SelectTrigger id={currencySelectId} className="w-full bg-background/80 h-10">
                    <SelectValue placeholder="选择币种" />
                  </SelectTrigger>
                  <SelectContent>
                    {DONATION_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label} ({c.code}) · {c.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preset Amounts */}
              <fieldset className="space-y-1.5 sm:space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  快捷金额预设
                </legend>
                <div className="grid grid-cols-4 gap-2">
                  {currencyConfig.presets.map((preset) => {
                    const isSelected = amount === preset
                    return (
                      <Button
                        key={preset}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={isSelected}
                        disabled={isLoading}
                        onClick={() => handleSelectPreset(preset)}
                        className={`h-9 font-medium transition-all ${
                          isSelected
                            ? 'ring-2 ring-primary ring-offset-1 font-bold'
                            : 'bg-background/80 hover:bg-accent'
                        }`}
                      >
                        {currencyConfig.symbol}{preset}
                      </Button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Custom Amount Input with Flexbox Layout */}
              <div className="space-y-1.5 sm:space-y-2">
                <label
                  htmlFor={amountInputId}
                  className="block text-sm font-medium text-foreground"
                >
                  赞助金额
                </label>
                <div className="flex rounded-md border border-input bg-background/80 shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden transition-all">
                  <span
                    className="inline-flex items-center px-3 text-muted-foreground text-sm font-semibold select-none bg-muted/30 border-r border-border/60"
                    aria-hidden="true"
                  >
                    {currencyConfig.symbol}
                  </span>
                  <input
                    id={amountInputId}
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck="false"
                    placeholder="添加社会点数"
                    value={amount}
                    onChange={handleAmountInputChange}
                    disabled={isLoading}
                    aria-describedby={amountHintId}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span
                    className="inline-flex items-center px-3 text-xs text-muted-foreground font-mono select-none bg-muted/10 border-l border-border/60"
                    aria-hidden="true"
                  >
                    {currencyConfig.code}
                  </span>
                </div>
                <p id={amountHintId} className="text-xs text-muted-foreground">
                  支持区间：{currencyConfig.symbol}{(currencyConfig.minMinorUnits / 100).toFixed(2)} - {currencyConfig.symbol}{(MAX_DONATION_MINOR_UNITS / 100).toFixed(2)} {currencyConfig.code}
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-destructive flex items-start gap-2.5 animate-in fade-in-50"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{errorMessage}</div>
                </div>
              )}
            </CardContent>

            <CardFooter className="pt-2 px-4 sm:px-6 pb-6">
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-md transition-all"
                disabled={isLoading || !isAmountValid || isConfigMissing}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />}
                {buttonText}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}