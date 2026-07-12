import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ResponsiveLayout from '@/components/ResponsiveLayout'
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
    <ResponsiveLayout
      items={NAV_ITEMS}
      role="customer"
      user={{
        name: session.user.name || '',
        email: session.user.email || '',
      }}
      chatbot={<Chatbot />}
    >
      {children}
    </ResponsiveLayout>
  )
}
