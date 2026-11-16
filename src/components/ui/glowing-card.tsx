import React from 'react'
import { cn } from '@/lib/utils'

interface GlowingCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  containerClassName?: string
}

/**
 * 具有质感微光的卡片容器；外层通过精致渐变微光与内层晶莹磨砂玻璃衬托，
 * 避免刺眼的无限快速旋转，支持减少动效偏好。
 */
export function GlowingCard({
  children,
  className,
  containerClassName,
  ...props
}: GlowingCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl p-[1px] transition-all duration-300 group/glow',
        containerClassName
      )}
      {...props}
    >
      {/* 质感渐变微边框：常态轻柔沉稳，悬浮时自然聚光 */}
      <div
        className="glowing-border-layer absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-500 opacity-60 group-hover/glow:opacity-100 bg-gradient-to-br from-primary/30 via-sky-400/20 to-primary/10 dark:from-primary/40 dark:via-sky-400/20 dark:to-transparent"
        aria-hidden="true"
      />
      {/* 实体卡片层 */}
      <div
        className={cn(
          'relative z-10 w-full h-full rounded-[calc(1rem-1px)] bg-card/90 dark:bg-card/95 backdrop-blur-xl border border-border/70 dark:border-white/10 shadow-xl transition-shadow duration-300 group-hover/glow:shadow-2xl',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}