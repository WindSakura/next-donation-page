import React from 'react'
import { cn } from '@/lib/utils'

interface BackgroundGridProps {
  className?: string
}

/**
 * 视觉风格参考 Aceternity UI (Background Grid & Beams)；代码为独立 CSS/SVG 实现，未复制代码库 Pro 源码。
 */
export function BackgroundGrid({ className }: BackgroundGridProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.14] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_40%,#000_65%,transparent_100%)]',
        className
      )}
      aria-hidden="true"
    />
  )
}

