import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminCreateOrderForm from './AdminCreateOrderForm'

export const metadata = { title: 'Create Order — Admin' }

export default async function AdminCreateOrderPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/auth/login')
  }

  const [customers, zones] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.zone.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create Order</h1>
        <p className="text-gold-muted mt-1">Place an order on behalf of any customer. Charges are calculated automatically.</p>
      </div>
      <AdminCreateOrderForm customers={customers} zones={zones} adminId={session!.user.id} />
    </div>
  )
}
