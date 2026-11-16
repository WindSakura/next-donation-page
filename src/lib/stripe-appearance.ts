import type { Appearance } from '@stripe/stripe-js'

// Stripe 的 iframe 运行在独立沙盒内，无法直接继承宿主 CSS 变量，需通过 appearance 精确对齐高对比设计规范。
export function getCheckoutAppearance(theme: 'light' | 'dark'): Appearance {
  const dark = theme === 'dark'
  return {
    theme: dark ? 'night' : 'stripe',
    labels: 'above',
    variables: {
      colorPrimary: dark ? '#818cf8' : '#4f46e5',
      colorBackground: dark ? '#0d131f' : '#ffffff',
      colorText: dark ? '#f8fafc' : '#0f172a',
      colorTextSecondary: dark ? '#94a3b8' : '#475569',
      colorTextPlaceholder: dark ? '#94a3b8' : '#64748b',
      colorDanger: dark ? '#f87171' : '#dc2626',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      fontSizeBase: '16px',
      spacingUnit: '4px',
      borderRadius: '12px',
      focusOutline: dark ? '2px solid #818cf8' : '2px solid #4f46e5',
      focusBoxShadow: 'none',
    },
    rules: {
      '.Input': {
        borderColor: dark ? '#1e293b' : '#cbd5e1',
        boxShadow: 'none',
        padding: '10px 14px',
      },
      '.Input:focus': {
        borderColor: dark ? '#818cf8' : '#4f46e5',
      },
      '.Tab': {
        borderColor: dark ? '#1e293b' : '#cbd5e1',
        boxShadow: 'none',
      },
      '.Tab--selected': {
        borderColor: dark ? '#818cf8' : '#4f46e5',
        backgroundColor: dark ? '#171f30' : '#f5f3ff',
      },
    },
  }
}