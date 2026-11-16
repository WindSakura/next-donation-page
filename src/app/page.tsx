'use client'

import { useState, useCallback, useRef, useEffect, useId } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js/pure'
import type { Stripe } from '@stripe/stripe-js'
import { DonationCheckout } from '@/components/donation-checkout'
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
import { Spotlight } from '@/components/ui/spotlight'
import { BackgroundGrid } from '@/components/ui/background-beams'
import { GlowingCard } from '@/components/ui/glowing-card'
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
import { AlertCircle, ArrowLeft, Loader2, Sparkles, ShieldCheck } from 'lucide-react'

const rawPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()

let cachedStripePromise: Promise<Stripe | null> | null = null

function getStripePromise(key: string): Promise<Stripe | null> {
  if (!cachedStripePromise) {
    cachedStripePromise = loadStripe(key, { locale: 'zh' }).catch((err) => {
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
  const currencySelectId = useId()
  const amountInputId = useId()
  const amountHintId = useId()

  const [currency, setCurrency] = useState<DonationCurrency>(DEFAULT_CURRENCY)
  const currencyConfig = getCurrencyConfig(currency)
  const [amount, setAmount] = useState<string>(currencyConfig.presets[0] ?? '20')
  const [isLoading, setIsLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateRequestId())
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)

  const amountInputRef = useRef<HTMLInputElement>(null)
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

  const handleCheckoutComplete = useCallback(() => {
    if (sessionId) {
      router.push(`/success?session_id=${encodeURIComponent(sessionId)}`)
    }
  }, [router, sessionId])

  let isAmountValid = false
  let formattedAmount: string | null = null
  let validationMessage: string | null = null

  if (amount.trim() === '') {
    validationMessage = '请输入赞助金额'
  } else {
    try {
      const minor = parseDonationAmount(amount.trim(), currency)
      isAmountValid = true
      formattedAmount = (minor / 100).toFixed(2)
    } catch (err: unknown) {
      if (err instanceof DonationValidationError) {
        validationMessage = err.message
      } else {
        validationMessage = '请输入有效金额，最多保留两位小数。'
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setClientSecret(null)
    setSessionId(null)
    setErrorMessage(null)
    setIdempotencyKey(generateRequestId())
    setTimeout(() => {
      amountInputRef.current?.focus()
    }, 50)
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
    ? '正在建立安全支付连接...'
    : isConfigMissing
      ? '在线支付暂不可用'
      : isAmountValid && formattedAmount
        ? `继续赞助 ${currencyConfig.symbol}${formattedAmount}`
        : validationMessage ?? '请输入有效金额'

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 pt-20 sm:pt-24 md:pt-24 pb-8 sm:pb-12 bg-cover bg-center bg-no-repeat bg-[url('/ero.jpg')] overflow-x-hidden">
      {/* 渐变遮罩与微环境光：确保文字高对比与二次元背景自然交融 */}
      <div className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-[4px] transition-colors duration-300" aria-hidden="true" />
      <Spotlight className="-top-36 left-0 sm:left-12" fill="#6366f1" />
      <BackgroundGrid />

      {clientSecret ? (
        /* 结账态：桌面横版宽双栏 / 手机单列紧凑条 */
        <Card className="relative z-10 w-full max-w-lg lg:max-w-6xl xl:max-w-[1180px] bg-card/95 backdrop-blur-2xl shadow-2xl border border-border/80 dark:border-white/10 rounded-2xl transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8 p-3.5 sm:p-6 lg:p-8">
            {/* 移动端可访问标题 */}
            <h1 className="sr-only lg:hidden">完成赞助支付</h1>

            {/* 移动端紧凑顶栏：直接展示金额与返回修改 */}
            <div className="lg:hidden flex items-center justify-between p-3.5 rounded-xl border border-border/70 dark:border-white/10 bg-muted/40 mb-3.5">
              <div>
                <div className="text-[11px] font-medium text-muted-foreground">赞助金额</div>
                <div className="text-base font-bold text-foreground">
                  {currencyConfig.symbol}{displayAmount}{' '}
                  <span className="text-xs font-mono text-muted-foreground">{currencyConfig.code}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReturnToEdit}
                className="h-8 px-2.5 text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                修改金额
              </Button>
            </div>

            {/* 桌面左列（宽 320-340px，Sticky 顶部居左） */}
            <div className="hidden lg:block w-[320px] xl:w-[340px] shrink-0 space-y-4 lg:sticky lg:top-8">
              <div className="space-y-1.5 text-left">
                <CardTitle as="h1" className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  完成赞助支付
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
                  请在右侧面板完成结账。确认后将自动跳转至支付结果核验页。
                </CardDescription>
              </div>

              {/* 赞助摘要 */}
              <div className="rounded-2xl border border-border/80 dark:border-white/10 bg-muted/30 p-4 space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">赞助战队</span>
                  <span className="text-xs font-semibold text-foreground">支持 DLsite 战队</span>
                </div>
                <div className="h-px bg-border/60" />
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-muted-foreground">赞助金额</span>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-foreground tracking-tight">
                      {currencyConfig.symbol}{displayAmount}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                      {currencyConfig.code}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic pt-2 border-t border-border/40 select-none">
                  “我的出租屋里真的有很多蟑螂，但我认识的粥批真的没有几个”
                </p>
              </div>

              {/* 安全提示 */}
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 dark:border-white/5 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>支付信息由 Stripe 安全处理，本站不存储卡号</span>
              </div>

              {/* 返回修改按钮 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReturnToEdit}
                className="w-full h-10 text-xs sm:text-sm flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回修改金额与币种
              </Button>
            </div>

            {/* 右列：Stripe 动态主题结算容器 */}
            <div className="w-full min-w-0 lg:flex-1 lg:max-w-[760px]">
              <div className="w-full rounded-2xl overflow-hidden border border-border/80 dark:border-white/10 bg-background/90 dark:bg-background/80 shadow-xl">
                {stripePromise && clientSecret ? (
                  <DonationCheckout
                    stripe={stripePromise}
                    clientSecret={clientSecret}
                    onComplete={handleCheckoutComplete}
                  />
                ) : (
                  <div className="p-8 text-center text-rose-700 dark:text-rose-300 text-sm" role="alert">
                    未加载 Stripe 运行环境，无法渲染结账表单。
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* 初始金额态：桌面横版双栏 / 手机单列 */
        <div className="relative z-10 w-full max-w-lg lg:max-w-5xl xl:max-w-6xl flex flex-col lg:flex-row lg:items-stretch lg:gap-8 gap-6">
          {/* 左侧叙事与品牌介绍 */}
          <div className="w-full lg:w-[460px] xl:w-[500px] shrink-0 flex flex-col justify-between text-left space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>支持 DLsite 战队 · 赞助通道</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground leading-[1.2]">
                请支持我们的战队，
                <br />
                为我们的战队投票
              </h1>

              {/* 战队名言卡片 */}
              <div className="relative p-4 sm:p-5 rounded-2xl border border-border/80 dark:border-white/10 bg-card/85 backdrop-blur-md shadow-lg border-l-4 border-l-primary">
                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed italic select-none">
                  “我的出租屋里真的有很多蟑螂，但我认识的粥批真的没有几个”
                </p>
              </div>
            </div>

            {/* 特性背书清单 */}
            <div className="hidden lg:grid grid-cols-1 gap-3 pt-5 border-t border-border/70 dark:border-white/10 text-xs text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>支付信息由 Stripe 安全处理，本站不存储卡号</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                <span>支持多币种与自选赞助金额</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span>支付完成后自动核对结果</span>
              </div>
            </div>
          </div>

          {/* 右侧金额选择面板 */}
          <GlowingCard containerClassName="w-full lg:flex-1">
            <CardHeader className="space-y-2 pb-3 sm:pb-4 text-left px-4 sm:px-6 pt-5 sm:pt-6">
              <CardTitle as="h2" className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                选择赞助金额
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
                选择币种与金额，继续完成赞助支付
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-4 sm:space-y-5 px-4 sm:px-6 pt-0">
                {isConfigMissing && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div className="leading-relaxed">
                      在线支付暂不可用，请稍后再试。
                    </div>
                  </div>
                )}

                {/* 币种选择 */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label
                    htmlFor={currencySelectId}
                    className="block text-xs sm:text-sm font-semibold text-foreground"
                  >
                    币种 / Currency
                  </label>
                  <Select value={currency} onValueChange={handleCurrencyChange} disabled={isLoading}>
                    <SelectTrigger id={currencySelectId} className="w-full h-11 border-border/80 dark:border-white/10">
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

                {/* 快捷金额预设 (微交互分段芯片选择) */}
                <fieldset className="space-y-1.5 sm:space-y-2">
                  <legend className="text-xs sm:text-sm font-semibold text-foreground">
                    快捷金额预设
                  </legend>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                          className={`h-11 font-medium transition-all ${
                            isSelected
                              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background font-bold shadow-md bg-primary text-primary-foreground'
                              : 'bg-background/70 hover:bg-accent/80 hover:text-accent-foreground border-border/80 dark:border-white/10'
                          }`}
                        >
                          {currencyConfig.symbol}{preset}
                        </Button>
                      )
                    })}
                  </div>
                </fieldset>

                {/* 自定义金额输入与就近错误提示 */}
                <div className="space-y-1.5 sm:space-y-2">
                  <label
                    htmlFor={amountInputId}
                    className="block text-xs sm:text-sm font-semibold text-foreground"
                  >
                    赞助金额
                  </label>
                  <div className="flex rounded-xl border border-input bg-background/80 backdrop-blur-sm shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background overflow-hidden transition-all">
                    <span
                      className="inline-flex items-center px-3 text-muted-foreground text-sm font-semibold select-none bg-muted/40 border-r border-border/60"
                      aria-hidden="true"
                    >
                      {currencyConfig.symbol}
                    </span>
                    <input
                      ref={amountInputRef}
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
                      aria-invalid={!isAmountValid && amount.trim() !== ''}
                      aria-describedby={amountHintId}
                      className="flex-1 min-w-0 bg-transparent px-3 py-2 text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
                    />
                    <span
                      className="inline-flex items-center px-3 text-xs text-muted-foreground font-mono select-none bg-muted/20 border-l border-border/60"
                      aria-hidden="true"
                    >
                      {currencyConfig.code}
                    </span>
                  </div>

                  {/* 格式校验提示：不符合区间时提供即时行内错误提示 */}
                  {!isAmountValid && amount.trim() !== '' ? (
                    <p id={amountHintId} role="alert" className="text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5 mt-1 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>{validationMessage}</span>
                    </p>
                  ) : (
                    <p id={amountHintId} className="text-xs text-muted-foreground">
                      支持区间：{currencyConfig.symbol}{(currencyConfig.minMinorUnits / 100).toFixed(2)} - {currencyConfig.symbol}{(MAX_DONATION_MINOR_UNITS / 100).toFixed(2)} {currencyConfig.code}
                    </p>
                  )}
                </div>

                {/* 全局错误提示 (API 创建失败等) */}
                {errorMessage && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs sm:text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2.5 animate-in fade-in-50"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <div className="flex-1 leading-relaxed">{errorMessage}</div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-2 px-4 sm:px-6 pb-6">
                <Button
                  type="submit"
                  className="w-full h-12 text-base font-semibold shadow-lg transition-all duration-150"
                  disabled={isLoading || !isAmountValid || isConfigMissing}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />}
                  {buttonText}
                </Button>
              </CardFooter>
            </form>
          </GlowingCard>
        </div>
      )}
    </div>
  )
}