import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '是的，这是一份礼物 | 为战队投票',
  description: '十分感谢您对我们战队DLsite的支持与赞助',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased bg-background text-foreground">
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  )
}