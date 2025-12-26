import './globals.css'
import type { Metadata } from 'next'


export const metadata: Metadata = {
  title: '是的，这是一份礼物',
  description: '感谢您在DLsite上的购买',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}
