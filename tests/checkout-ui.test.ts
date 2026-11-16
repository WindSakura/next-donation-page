// @vitest-environment jsdom

import { createElement } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stripe, StripeCheckoutElementsSdkOptions } from '@stripe/stripe-js'
import { DonationCheckout } from '../src/components/donation-checkout'
import { ThemeProvider } from '../src/components/theme-provider'
import { ThemeSwitcher } from '../src/components/theme-switcher'

let systemDark = false
const systemListeners = new Set<(event: { matches: boolean }) => void>()

function fakeElement(label: string, readyEvent?: unknown) {
  const listeners = new Map<string, (event?: unknown) => void>()
  let input: HTMLInputElement | null = null
  return {
    on: vi.fn((event: string, handler: (event?: unknown) => void) => {
      listeners.set(event, handler)
      if (event === 'ready') queueMicrotask(() => handler(readyEvent))
    }),
    off: vi.fn((event: string) => { listeners.delete(event) }),
    mount: vi.fn((node: HTMLElement) => {
      input = document.createElement('input')
      input.setAttribute('aria-label', label)
      node.appendChild(input)
    }),
    destroy: vi.fn(() => { input?.remove() }),
    update: vi.fn(),
    emit(event: string, data?: unknown) { listeners.get(event)?.(data) },
  }
}

function setup() {
  const session = {
    id: 'cs_test_ui_1234567890',
    status: { type: 'open' },
    total: { total: { minorUnitsAmount: 1999, amount: '$19.99' } },
  }
  const confirm = vi.fn().mockResolvedValue({
    type: 'success', session: { ...session, status: { type: 'complete', paymentStatus: 'unpaid' } },
  })
  const payment = fakeElement('Stripe 测试支付字段')
  const contact = fakeElement('Stripe 测试邮箱字段')
  const express = fakeElement('Stripe 测试快捷支付', { availablePaymentMethods: { link: true } })
  const sdk = {
    on: vi.fn(),
    loadActions: vi.fn().mockResolvedValue({
      type: 'success',
      actions: { getSession: () => session, confirm },
    }),
    changeAppearance: vi.fn(),
    createPaymentElement: vi.fn(() => payment),
    createContactDetailsElement: vi.fn(() => contact),
    createExpressCheckoutElement: vi.fn(() => express),
  }
  const stripe = {
    elements: vi.fn(),
    createToken: vi.fn(),
    createPaymentMethod: vi.fn(),
    confirmCardPayment: vi.fn(),
    initCheckoutElementsSdk: vi.fn<(options: StripeCheckoutElementsSdkOptions) => typeof sdk>()
      .mockReturnValue(sdk),
  }
  // Replace only Stripe.js's external SDK boundary; use the real React provider.
  const stripePromise = Promise.resolve(stripe as unknown as Stripe)
  const onComplete = vi.fn()
  const props = { stripe: stripePromise, clientSecret: 'test_client_secret', onComplete }
  return { session, confirm, payment, express, sdk, stripe, props, onComplete }
}

async function waitUntilReady() {
  await waitFor(() => {
    const button = screen.getByRole('button', { name: /确认赞助/ })
    expect(button.hasAttribute('disabled')).toBe(false)
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  systemDark = false
  systemListeners.clear()
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: systemDark,
    addListener: (handler: (event: { matches: boolean }) => void) => { systemListeners.add(handler) },
    removeListener: (handler: (event: { matches: boolean }) => void) => { systemListeners.delete(handler) },
  }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('themed Stripe checkout', () => {
  it('follows manual and system theme changes without recreating the session or clearing fields', async () => {
    const { stripe, sdk, payment, props } = setup()
    render(createElement(
      ThemeProvider,
      null,
      createElement(ThemeSwitcher),
      createElement(DonationCheckout, props),
    ))
    await waitUntilReady()
    const field = screen.getByLabelText('Stripe 测试支付字段')
    fireEvent.change(field, { target: { value: '保留已输入信息' } })

    fireEvent.click(screen.getByRole('button', { name: '深色' }))
    await waitFor(() => {
      expect(sdk.changeAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'night' }))
    })
    fireEvent.click(screen.getByRole('button', { name: '浅色' }))
    await waitFor(() => {
      expect(sdk.changeAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'stripe' }))
    })
    fireEvent.click(screen.getByRole('button', { name: /系统/ }))
    act(() => {
      systemDark = true
      systemListeners.forEach((handler) => handler({ matches: true }))
    })
    await waitFor(() => {
      expect(sdk.changeAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'night' }))
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
    act(() => {
      systemDark = false
      systemListeners.forEach((handler) => handler({ matches: false }))
    })
    await waitFor(() => {
      expect(sdk.changeAppearance).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'stripe' }))
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })
    expect(stripe.initCheckoutElementsSdk).toHaveBeenCalledTimes(1)
    expect(stripe.initCheckoutElementsSdk).toHaveBeenCalledWith(expect.objectContaining({
      clientSecret: props.clientSecret,
      elementsOptions: expect.objectContaining({ appearance: expect.objectContaining({ theme: 'stripe' }) }),
    }))
    expect(payment.mount).toHaveBeenCalledTimes(1)
    expect(payment.destroy).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Stripe 测试支付字段')).toBe(field)
    expect((field as HTMLInputElement).value).toBe('保留已输入信息')
  })

  it('locks repeat submissions and sends delayed-payment completion to server verification', async () => {
    const { props, confirm, onComplete } = setup()
    let resolveConfirm!: (result: unknown) => void
    confirm.mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }))
    render(createElement(DonationCheckout, props))
    await waitUntilReady()
    const form = screen.getByRole('form', { name: '赞助支付' })
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith({ redirect: 'if_required' })
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => {
      resolveConfirm({ type: 'success', session: { status: { type: 'complete', paymentStatus: 'unpaid' } } })
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('ignores an old confirmation callback after leaving the checkout', async () => {
    const { props, confirm, onComplete } = setup()
    let resolveConfirm!: (result: unknown) => void
    confirm.mockReturnValue(new Promise((resolve) => { resolveConfirm = resolve }))
    const view = render(createElement(DonationCheckout, props))
    await waitUntilReady()
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    view.unmount()
    await act(async () => { resolveConfirm({ type: 'success' }) })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows provider validation errors and allows a payment retry', async () => {
    const { props, confirm, onComplete } = setup()
    confirm.mockResolvedValueOnce({ type: 'error', error: { message: '请检查银行卡有效期。' } })
    render(createElement(DonationCheckout, props))
    await waitUntilReady()
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '请检查银行卡有效期。')
    expect(onComplete).not.toHaveBeenCalled()
    await waitUntilReady()
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })

  it('allows retrying a failed confirmation without claiming payment succeeded', async () => {
    const { props, confirm, onComplete } = setup()
    confirm.mockRejectedValueOnce(new Error('connection failure'))
    render(createElement(DonationCheckout, props))
    await waitUntilReady()
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    expect((await screen.findByRole('alert')).textContent).toContain('请检查网络后重试')
    expect(onComplete).not.toHaveBeenCalled()
    await waitUntilReady()
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })

  it('recovers from a rejected SDK initialization using the same session', async () => {
    const { props, sdk, stripe } = setup()
    sdk.loadActions.mockRejectedValueOnce(new Error('network failure'))
    render(createElement(DonationCheckout, props))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent', '支付表单未能加载，请检查网络或浏览器拦截设置后重试。',
    )
    fireEvent.click(screen.getByRole('button', { name: '重新加载支付表单' }))
    await waitUntilReady()
    expect(stripe.initCheckoutElementsSdk).toHaveBeenCalledTimes(2)
    expect(stripe.initCheckoutElementsSdk.mock.calls.every(([options]) => (
      options.clientSecret === props.clientSecret
    ))).toBe(true)
  })

  it('reports an iframe load failure and reloads only on an explicit retry', async () => {
    const { props, payment, stripe } = setup()
    render(createElement(DonationCheckout, props))
    await waitUntilReady()
    act(() => payment.emit('loaderror', { error: { message: 'blocked iframe' } }))
    expect(screen.getByRole('alert').textContent).toContain('支付表单未能加载')
    expect(stripe.initCheckoutElementsSdk).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '重新加载支付表单' }))
    await waitUntilReady()
    expect(stripe.initCheckoutElementsSdk).toHaveBeenCalledTimes(2)
  })

  it('passes wallet confirmation events through and reports wallet failures', async () => {
    const { props, confirm, express, onComplete } = setup()
    confirm.mockResolvedValueOnce({ type: 'error', error: { message: '请尝试其他支付方式。' } })
    render(createElement(DonationCheckout, props))
    await waitUntilReady()
    const event = { paymentFailed: vi.fn(), expressPaymentType: 'link' }
    await act(async () => express.emit('confirm', event))
    expect(confirm).toHaveBeenCalledWith({ redirect: 'if_required', expressCheckoutConfirmEvent: event })
    expect(event.paymentFailed).toHaveBeenCalledWith({ reason: 'fail', message: '请尝试其他支付方式。' })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('prevents confirming an expired session', async () => {
    const { props, session, confirm, express } = setup()
    session.status = { type: 'expired' }
    render(createElement(DonationCheckout, props))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent', '这笔支付会话已过期，请返回修改金额后重新发起赞助。',
    )
    fireEvent.submit(screen.getByRole('form', { name: '赞助支付' }))
    const event = { paymentFailed: vi.fn(), expressPaymentType: 'link' }
    await act(async () => express.emit('confirm', event))
    expect(event.paymentFailed).toHaveBeenCalledWith({ reason: 'fail' })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('verifies an already completed session without confirming a second payment', async () => {
    const { props, session, confirm, onComplete } = setup()
    session.status = { type: 'complete' }
    render(createElement(DonationCheckout, props))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(confirm).not.toHaveBeenCalled()
  })
})
