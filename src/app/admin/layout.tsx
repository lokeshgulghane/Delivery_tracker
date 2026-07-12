import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ResponsiveLayout from '@/components/ResponsiveLayout'

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
    <ResponsiveLayout
      items={NAV_ITEMS}
      role="admin"
      user={{
        name: session.user.name || '',
        email: session.user.email || '',
      }}
    >
      {children}
    </ResponsiveLayout>
  )
}
