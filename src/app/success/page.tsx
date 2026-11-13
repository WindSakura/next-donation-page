'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardTitle,
} from '@/components/ui/card'
import {
  type CheckoutSessionData,
  type PaymentStatusCategory,
  parseCheckoutSessionResponse,
  classifySession,
  formatAmount,
} from '@/components/checkout-status'
import { CheckCircle2, Clock, AlertCircle, RefreshCw, Loader2, ArrowLeft, Info } from 'lucide-react'

type SuccessViewCategory = PaymentStatusCategory | 'loading' | 'error'

interface SuccessViewState {
  category: SuccessViewCategory
  sessionId: string | null
  data: CheckoutSessionData | null
  errorMessage: string | null
  isRefreshing: boolean
}

export default function SuccessPage() {
  const [viewState, setViewState] = useState<SuccessViewState>({
    category: 'loading',
    sessionId: null,
    data: null,
    errorMessage: null,
    isRefreshing: false,
  })

  const activeControllerRef = useRef<AbortController | null>(null)
  const unmountedRef = useRef(false)

  const checkStatus = useCallback(async (sid: string, isManualRefresh: boolean) => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
    }
    const controller = new AbortController()
    activeControllerRef.current = controller

    if (isManualRefresh) {
      setViewState((prev) => ({ ...prev, isRefreshing: true, errorMessage: null }))
    }

    // 35s timeout to accommodate provider lookup and retries
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, 35000)

    try {
      const res = await fetch(`/api/check-checkout?session_id=${encodeURIComponent(sid)}`, {
        signal: controller.signal,
      })

      const json: unknown = await res.json().catch(() => null)

      if (unmountedRef.current || activeControllerRef.current !== controller) return

      if (!res.ok) {
        let msg = '查询支付记录失败，请稍后重试。'
        if (
          typeof json === 'object' &&
          json !== null &&
          'error' in json &&
          typeof json.error === 'string'
        ) {
          msg = json.error
        }
        setViewState({
          category: 'error',
          sessionId: sid,
          data: null,
          errorMessage: msg,
          isRefreshing: false,
        })
        return
      }

      const parsed = parseCheckoutSessionResponse(json)
      if (!parsed) {
        setViewState({
          category: 'error',
          sessionId: sid,
          data: null,
          errorMessage: '支付服务返回了未知的响应数据格式。',
          isRefreshing: false,
        })
        return
      }

      const category = classifySession(parsed)
      setViewState({
        category,
        sessionId: sid,
        data: parsed,
        errorMessage: null,
        isRefreshing: false,
      })
    } catch (err: unknown) {
      if (unmountedRef.current || activeControllerRef.current !== controller) return

      let msg = '无法连接支付核对服务，请重试。'
      if (err instanceof DOMException && err.name === 'AbortError') {
        msg = '核对请求超时，请检查网络后点击重试。'
      }
      setViewState({
        category: 'error',
        sessionId: sid,
        data: null,
        errorMessage: msg,
        isRefreshing: false,
      })
    } finally {
      clearTimeout(timeoutId)
      if (!unmountedRef.current && activeControllerRef.current === controller) {
        setViewState((prev) => ({ ...prev, isRefreshing: false }))
      }
    }
  }, [])

  useEffect(() => {
    unmountedRef.current = false

    async function init() {
      // Microtask yield prevents synchronous setState inside effect body
      await Promise.resolve()
      if (unmountedRef.current) return

      const params = new URLSearchParams(window.location.search)
      const sid = params.get('session_id')

      if (!sid) {
        setViewState({
          category: 'error',
          sessionId: null,
          data: null,
          errorMessage: '链接缺少支付会话编号 (session_id)，无法核验支付状态。',
          isRefreshing: false,
        })
        return
      }

      setViewState((prev) => ({ ...prev, sessionId: sid }))
      await checkStatus(sid, false)
    }

    init()

    return () => {
      unmountedRef.current = true
      if (activeControllerRef.current) {
        activeControllerRef.current.abort()
      }
    }
  }, [checkStatus])

  const handleManualRetry = () => {
    if (!viewState.sessionId || viewState.isRefreshing) return
    checkStatus(viewState.sessionId, true)
  }

  const { category, data, sessionId, errorMessage, isRefreshing } = viewState

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 bg-cover bg-center bg-no-repeat bg-[url('/ero.jpg')]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-hidden="true" />

      <Card className="relative z-10 w-full max-w-lg bg-card/95 backdrop-blur-md shadow-2xl border border-white/20 rounded-2xl overflow-hidden p-6 sm:p-8 text-center">
        {category === 'loading' && (
          <div className="py-8 space-y-4">
            <Loader2 className="w-14 h-14 text-primary animate-spin mx-auto text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">正在核对支付结果...</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              请稍候，系统正在向支付服务核验交易状态。
            </p>
          </div>
        )}

        {category === 'paid' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                十分感谢您对我们战队DLsite的支持
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                您的赞助付款已确认，十分感谢您对战队的支持！
              </CardDescription>
            </div>

            {/* Details Box */}
            <div className="p-4 rounded-xl bg-muted/60 border text-left text-sm space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">赞助金额</span>
                <span className="font-bold text-base text-foreground">
                  {formatAmount(data?.amountTotal ?? null, data?.currency ?? null)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">支付状态</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  付款已确认
                </span>
              </div>
              {sessionId && (
                <div className="flex justify-between items-center py-1 text-xs">
                  <span className="text-muted-foreground">会话编号</span>
                  <span className="font-mono text-muted-foreground truncate max-w-[200px]" title={sessionId}>
                    {sessionId.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="w-full sm:w-auto h-11 px-8 font-semibold shadow-md">
                <Link href="/">返回首页 / 再赞助一笔</Link>
              </Button>
            </CardFooter>
          </div>
        )}

        {category === 'processing' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Clock className="w-16 h-16 text-amber-500 mx-auto animate-pulse" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                支付正在处理中
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                支付渠道正在确认中，尚未收到最终付款确认。请稍候并点击下方刷新按钮查看最新状态，请勿重复发起付款。
              </CardDescription>
            </div>

            <div
              role="status"
              aria-live="polite"
              className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed text-left flex items-start gap-2.5"
            >
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                系统已接收到结账完成信号，等待支付渠道回传最终结果。若已扣款请耐心等待，避免重复支付。
              </div>
            </div>

            {data?.amountTotal && (
              <div className="p-4 rounded-xl bg-muted/60 border text-left text-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">付款金额</span>
                  <span className="font-semibold text-foreground">
                    {formatAmount(data.amountTotal, data.currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">处理进度</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    等待渠道确认
                  </span>
                </div>
              </div>
            )}

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={handleManualRetry}
                disabled={isRefreshing}
                className="w-full sm:w-auto h-11 px-6 font-semibold shadow-md flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? '正在核对...' : '刷新查询状态'}
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto h-11 px-6">
                <Link href="/">返回首页</Link>
              </Button>
            </CardFooter>
          </div>
        )}

        {category === 'incomplete' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                支付尚未完成
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                此支付会话处于开启状态，但尚未完成支付。若您未完成付款，可返回重新发起；若已在渠道扣款，请稍候重试查询。
              </CardDescription>
            </div>

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              {sessionId && (
                <Button
                  onClick={handleManualRetry}
                  disabled={isRefreshing}
                  className="w-full sm:w-auto h-11 px-6 font-semibold shadow-md flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? '正在重试...' : '重试查询状态'}
                </Button>
              )}
              <Button asChild variant="outline" className="w-full sm:w-auto h-11 px-6 flex items-center gap-1.5">
                <Link href="/">
                  <ArrowLeft className="w-4 h-4" />
                  返回赞助首页
                </Link>
              </Button>
            </CardFooter>
          </div>
        )}

        {category === 'expired' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                支付会话已过期
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                会话已过期，当前尚未确认付款；若已扣款请勿重复支付，可点击下方重试查询或稍后再看。
              </CardDescription>
            </div>

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              {sessionId && (
                <Button
                  onClick={handleManualRetry}
                  disabled={isRefreshing}
                  className="w-full sm:w-auto h-11 px-6 font-semibold shadow-md flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? '正在重试...' : '重试查询状态'}
                </Button>
              )}
              <Button asChild variant="outline" className="w-full sm:w-auto h-11 px-6 flex items-center gap-1.5">
                <Link href="/">
                  <ArrowLeft className="w-4 h-4" />
                  返回重新发起
                </Link>
              </Button>
            </CardFooter>
          </div>
        )}

        {category === 'no_payment_required' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Info className="w-16 h-16 text-sky-500 mx-auto" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-sky-600 dark:text-sky-400">
                此记录无需付款
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                此赞助记录经确认无需进行支付扣款。
              </CardDescription>
            </div>

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="w-full sm:w-auto h-11 px-8 font-semibold shadow-md">
                <Link href="/">返回赞助首页</Link>
              </Button>
            </CardFooter>
          </div>
        )}

        {category === 'error' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                支付状态核验失败
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                无法确认这笔支付记录，请稍后重试。
              </CardDescription>
            </div>

            {errorMessage && (
              <div
                role="alert"
                aria-live="polite"
                className="p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 text-xs sm:text-sm text-destructive leading-relaxed text-left flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            <CardFooter className="p-0 pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              {sessionId && (
                <Button
                  onClick={handleManualRetry}
                  disabled={isRefreshing}
                  className="w-full sm:w-auto h-11 px-6 font-semibold shadow-md flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? '正在重试...' : '重试查询状态'}
                </Button>
              )}
              <Button asChild variant="outline" className="w-full sm:w-auto h-11 px-6 flex items-center gap-1.5">
                <Link href="/">
                  <ArrowLeft className="w-4 h-4" />
                  返回赞助首页
                </Link>
              </Button>
            </CardFooter>
          </div>
        )}
      </Card>
    </div>
  )
}