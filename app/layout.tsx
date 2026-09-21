import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '2D MAGIC GENERATOR',
  description: 'AI production engine for 2D animation - NEXUS Brain: GROQ -> OpenRouter -> Local',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
