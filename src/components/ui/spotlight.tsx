import React from 'react'
import { cn } from '@/lib/utils'

interface SpotlightProps {
  className?: string
  fill?: string
}

/**
 * 柔和聚光氛围；采用原生 CSS 径向渐变与高斯柔化独立实现，不刺眼、不遮挡背景艺术细节。
 */
export function Spotlight({ className, fill = '#6366f1' }: SpotlightProps) {
  return (
    <div
      className={cn(
        'animate-spotlight pointer-events-none absolute -top-40 -left-20 z-0 h-[500px] w-[500px] sm:h-[750px] sm:w-[750px] rounded-full blur-[90px] sm:blur-[130px] opacity-20 dark:opacity-30 motion-reduce:animate-none motion-reduce:opacity-20',
        className
      )}
      style={{
        background: `radial-gradient(circle at 45% 45%, ${fill} 0%, rgba(56, 189, 248, 0.25) 50%, transparent 75%)`,
      }}
      aria-hidden="true"
    />
  )
}