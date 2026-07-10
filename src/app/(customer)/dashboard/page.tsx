import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

export const metadata = { title: 'Dashboard — DeliveryTracker' }

export default async function CustomerDashboard() {
  const session = await auth()

  const [orders, stats] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: session!.user.id },
      include: {
        pickupZone: { select: { name: true } },
        dropZone: { select: { name: true } },
        agent: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { customerId: session!.user.id },
      _count: { status: true },
    }),
  ])

  const totalOrders = stats.reduce((a, b) => a + b._count.status, 0)
  const deliveredCount = stats.find((s) => s.status === OrderStatus.DELIVERED)?._count.status || 0
  const activeCount = stats.filter((s) => !['DELIVERED', 'FAILED'].includes(s.status)).reduce((a, b) => a + b._count.status, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Welcome back, {session!.user.name?.split(' ')[0]} 👋</h1>
        <p className="text-slate-400 mt-1">Here&apos;s an overview of your deliveries</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="stat-card">
          <p className="text-sm text-slate-400 mb-1">Total Orders</p>
          <p className="text-3xl font-bold gradient-text">{totalOrders}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400 mb-1">Active Orders</p>
          <p className="text-3xl font-bold text-blue-400">{activeCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400 mb-1">Delivered</p>
          <p className="text-3xl font-bold text-green-400">{deliveredCount}</p>
        </div>
      </div>

      {/* Quick action */}
      <div className="card-elevated mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold mb-1">Ready to ship?</h2>
          <p className="text-sm text-slate-400">Place a new order and get an instant charge estimate</p>
        </div>
        <Link href="/orders/new" className="btn-primary shrink-0">
          + New Order
        </Link>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Orders</h2>
          <Link href="/orders" className="text-sm text-purple-400 hover:text-purple-300">View all →</Link>
        </div>

        {orders.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-4">📦</div>
            <p className="text-slate-400 mb-4">No orders yet. Place your first delivery!</p>
            <Link href="/orders/new" className="btn-primary inline-flex">+ Place Order</Link>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Agent</th>
                    <th>Charge</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="font-mono text-purple-300">#{generateOrderShortId(order.id)}</td>
                      <td>
                        <div className="text-xs">
                          <p className="text-slate-300 truncate max-w-[150px]">{order.pickupZone?.name || '—'}</p>
                          <p className="text-slate-500">→ {order.dropZone?.name || '—'}</p>
                        </div>
                      </td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="text-slate-400 text-sm">{order.agent?.name || '—'}</td>
                      <td className="font-semibold text-purple-300">{formatCurrency(order.totalCharge)}</td>
                      <td className="text-slate-400 text-xs">{formatDate(order.createdAt)}</td>
                      <td>
                        <Link href={`/orders/${order.id}`} className="text-xs text-purple-400 hover:text-purple-300">
                          Track →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
