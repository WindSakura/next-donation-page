'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

const emptySubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

const THEME_OPTIONS = [
  { value: 'system', label: '跟随系统', Icon: Monitor },
  { value: 'light', label: '浅色', Icon: Sun },
  { value: 'dark', label: '深色', Icon: Moon },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    getClientSnapshot,
    getServerSnapshot
  )

  const currentTheme = mounted ? (theme ?? 'system') : null

  return (
    <div
      role="group"
      aria-label="界面主题切换"
      className="fixed top-4 right-4 sm:right-6 z-50 max-w-[calc(100vw-2rem)] inline-flex items-center gap-1 p-1 rounded-2xl border border-border/80 dark:border-white/10 bg-card/90 backdrop-blur-xl shadow-lg transition-all duration-200"
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const isActive = currentTheme === value
        return (
          <button
            key={value}
            type="button"
            disabled={!mounted}
            aria-pressed={mounted ? isActive : undefined}
            onClick={() => setTheme(value)}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 h-11 min-h-[44px] px-3 sm:px-3.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 disabled:cursor-not-allowed select-none active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none',
              isActive
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
            )}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}