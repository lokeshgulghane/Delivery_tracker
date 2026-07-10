'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem { href: string; icon: string; label: string }
interface SidebarProps {
  items: NavItem[]
  role: 'customer' | 'admin' | 'agent'
  user: { name: string; email: string }
}

const ROLE_CONFIG = {
  customer: { label: 'Customer Portal', icon: '👤' },
  admin:    { label: 'Admin Panel',     icon: '⚙️' },
  agent:    { label: 'Agent Portal',    icon: '🛵' },
}

export default function Sidebar({ items, role, user }: SidebarProps) {
  const pathname = usePathname()
  const config = ROLE_CONFIG[role]

  return (
    <aside className="w-64 min-h-screen flex flex-col" style={{ background: '#0a0a0a', borderRight: '1px solid rgba(212,160,23,0.15)' }}>
      {/* Logo */}
      <div className="p-5" style={{ borderBottom: '1px solid rgba(212,160,23,0.12)' }}>
        <Link href="/" className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl gold-gradient flex items-center justify-center text-lg font-bold text-black">
            🚚
          </div>
          <span className="text-lg font-bold gradient-text">DeliveryTracker</span>
        </Link>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.2)' }}>
          <span className="text-sm">{config.icon}</span>
          <span className="text-xs font-semibold text-gold-primary">{config.label}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href.length > 1 && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? 'active' : ''}`}>
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(212,160,23,0.12)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full gold-gradient flex items-center justify-center text-sm font-bold text-black shrink-0">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-gold-primary">{user?.name}</p>
            <p className="text-xs truncate text-gold-muted">{user?.email}</p>
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full text-left nav-link text-red-400 hover:bg-red-400/10 hover:text-red-300">
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
