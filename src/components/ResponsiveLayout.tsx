'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

interface NavItem { href: string; icon: string; label: string }
interface ResponsiveLayoutProps {
  children: React.ReactNode
  items: NavItem[]
  role: 'customer' | 'admin' | 'agent'
  user: { name: string; email: string }
  chatbot?: React.ReactNode
}

export default function ResponsiveLayout({
  children,
  items,
  role,
  user,
  chatbot,
}: ResponsiveLayoutProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar on navigation change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-[#080808] text-[#F0EAD6]">
      {/* Sidebar - Desktop (visible statically) & Mobile (fixed drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:flex lg:flex-col lg:flex-shrink-0`}
      >
        <Sidebar items={items} role={role} user={user} onCloseMobile={() => setIsOpen(false)} />
      </aside>

      {/* Backdrop overlay for mobile drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main layout area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile Top Bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-[rgba(212,160,23,0.15)] sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOpen(true)}
              className="p-2 text-gold-primary hover:bg-gold-subtle-bg rounded-lg transition-colors focus:outline-none"
              aria-label="Open Sidebar"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gold-gradient flex items-center justify-center text-md font-bold text-black">
                🚚
              </div>
              <span className="text-md font-bold gradient-text">DeliveryTracker</span>
            </Link>
          </div>

          <div className="w-8 h-8 rounded-full gold-gradient flex items-center justify-center text-xs font-bold text-black">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto focus:outline-none">{children}</main>
      </div>

      {chatbot}
    </div>
  )
}
