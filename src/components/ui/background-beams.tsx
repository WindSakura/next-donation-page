import React from 'react'
import { cn } from '@/lib/utils'

interface BackgroundGridProps {
  className?: string
}

/**
 * 细腻的几何微网格底纹，通过径向渐变遮罩自然淡出，增强空间纵深感。
 */
export function BackgroundGrid({ className }: BackgroundGridProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.07] dark:opacity-[0.16] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_40%,#000_60%,transparent_100%)]',
        className
      )}
      aria-hidden="true"
    />
  )
}