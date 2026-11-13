import React from 'react'
import { cn } from '@/lib/utils'

interface SpotlightProps {
  className?: string
  fill?: string
}

/**
 * 视觉风格参考 Aceternity 聚光氛围；采用原生 CSS 径向渐变与高斯柔化独立实现，无第三方 SVG 几何依赖。
 */
export function Spotlight({ className, fill = '#8b5cf6' }: SpotlightProps) {
  return (
    <div
      className={cn(
        'animate-spotlight pointer-events-none absolute -top-40 -left-20 z-0 h-[600px] w-[600px] sm:h-[800px] sm:w-[800px] rounded-full blur-[100px] sm:blur-[140px] opacity-25',
        className
      )}
      style={{
        background: `radial-gradient(circle at 40% 40%, ${fill} 0%, rgba(56, 189, 248, 0.4) 45%, transparent 75%)`,
      }}
      aria-hidden="true"
    />
  )
}
