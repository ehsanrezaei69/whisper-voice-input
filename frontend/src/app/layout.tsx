import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Whisper Voice Input Test',
  description: 'Test project for Whisper.js voice input',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  )
}

