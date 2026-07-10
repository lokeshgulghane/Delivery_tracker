import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Chatbot from '@/components/Chatbot'

const NAV_ITEMS = [
  { href: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { href: '/orders', icon: '📦', label: 'My Orders' },
  { href: '/orders/new', icon: '➕', label: 'New Order' },
]

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  if (session.user.role === 'ADMIN') redirect('/admin')
  if (session.user.role === 'AGENT') redirect('/agent')

  return (
    <div className="flex min-h-screen">
      <Sidebar items={NAV_ITEMS} role="customer" user={session.user} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <Chatbot />
    </div>
  )
}
