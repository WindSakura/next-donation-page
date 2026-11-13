import React from 'react'
import { cn } from '@/lib/utils'

interface GlowingCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  containerClassName?: string
}

/**
 * 视觉风格参考 Aceternity 旋转微光边框；采用纯 CSS 锥形渐变与关键帧动画独立实现。
 * 在减少动效模式下保持静态柔和边框可见；内层保留充足边距以确保内部表单焦点环不被裁剪。
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
        'relative rounded-2xl p-[1px] overflow-hidden group/glow',
        containerClassName
      )}
      {...props}
    >
      {/* 动态光晕旋转层（prefers-reduced-motion 下通过 CSS 停止旋转并保持静态边框） */}
      <div
        className="glowing-border-layer absolute -inset-[100%] animate-spin-slow opacity-[0.65] group-hover/glow:opacity-95 transition-opacity duration-500 pointer-events-none bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,transparent_270deg,#8b5cf6_315deg,#38bdf8_360deg)]"
        aria-hidden="true"
      />
      {/* 实体卡片层 */}
      <div
        className={cn(
          'relative z-10 w-full h-full rounded-[calc(1rem-1px)] bg-card/95 backdrop-blur-xl border border-white/10 shadow-2xl',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
