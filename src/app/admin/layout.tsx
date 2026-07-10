import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Chatbot from '@/components/Chatbot'

const NAV_ITEMS = [
  { href: '/admin', icon: '📊', label: 'Dashboard' },
  { href: '/admin/orders', icon: '📦', label: 'All Orders' },
  { href: '/admin/orders/new', icon: '➕', label: 'Create Order' },
  { href: '/admin/zones', icon: '🗺️', label: 'Zones' },
  { href: '/admin/rate-cards', icon: '💰', label: 'Rate Cards' },
  { href: '/admin/cod-surcharges', icon: '💵', label: 'COD Surcharges' },
  { href: '/admin/agents', icon: '🛵', label: 'Agents' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="flex min-h-screen">
      <Sidebar items={NAV_ITEMS} role="admin" user={session.user} />
      <main className="flex-1 overflow-auto">{children}</main>
      <Chatbot />
    </div>
  )
}
