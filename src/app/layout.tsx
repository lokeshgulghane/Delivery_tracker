import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { SessionProvider } from 'next-auth/react'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'DeliveryTracker — Last-Mile Delivery Platform',
  description: 'Intelligent last-mile delivery management with real-time tracking, automated agent assignment, and AI-powered customer support.',
  keywords: 'delivery tracking, last mile logistics, B2B delivery, courier tracking',
  openGraph: {
    title: 'DeliveryTracker',
    description: 'Real-time last-mile delivery management platform',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`} style={{ background: '#080808', color: '#F0EAD6' }}>
        <SessionProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1a1a1a',
                border: '1px solid rgba(212,160,23,0.3)',
                color: '#F0EAD6',
              },
            }}
          />
        </SessionProvider>
      </body>
    </html>
  )
}
