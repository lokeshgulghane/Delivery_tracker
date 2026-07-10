import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const NAV_ITEMS = [
  { href: '/agent', icon: '🏠', label: 'Dashboard' },
  { href: '/agent/orders', icon: '📦', label: 'My Orders' },
]

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  if (session.user.role === 'ADMIN') redirect('/admin')
  if (session.user.role === 'CUSTOMER') redirect('/dashboard')

  return (
    <div className="flex min-h-screen">
      <Sidebar items={NAV_ITEMS} role="agent" user={session.user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
