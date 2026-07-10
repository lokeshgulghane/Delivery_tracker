import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'
import AgentLocationUpdater from './AgentLocationUpdater'
import { OrderStatus } from '@prisma/client'

export const metadata = { title: 'Agent Dashboard — DeliveryTracker' }

export default async function AgentDashboard() {
  const session = await auth()

  const [profile, activeOrders, completedToday] = await Promise.all([
    prisma.agentProfile.findFirst({
      where: { userId: session!.user.id },
      include: { currentZone: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: {
        agentId: session!.user.id,
        status: { notIn: [OrderStatus.DELIVERED, OrderStatus.FAILED] },
      },
      include: { customer: { select: { name: true, phone: true } }, pickupZone: true, dropZone: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.order.count({
      where: {
        agentId: session!.user.id,
        status: OrderStatus.DELIVERED,
        updatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Agent Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome back, {session!.user.name?.split(' ')[0]}</p>
      </div>

      {/* Agent Status */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <p className="text-sm text-slate-400">Status</p>
          <p className={`text-xl font-bold mt-1 ${profile?.isAvailable ? 'text-green-400' : 'text-orange-400'}`}>
            {profile?.isAvailable ? '● Available' : '🚚 On Delivery'}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Current Zone</p>
          <p className="text-xl font-bold gradient-text mt-1">{profile?.currentZone?.name || 'Unknown'}</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-slate-400">Delivered Today</p>
          <p className="text-3xl font-bold text-green-400">{completedToday}</p>
        </div>
      </div>

      {/* Location Updater */}
      <AgentLocationUpdater />

      {/* Active Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Active Orders ({activeOrders.length})</h2>
          <Link href="/agent/orders" className="text-sm text-purple-400 hover:text-purple-300">All orders →</Link>
        </div>

        {activeOrders.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-4">🎉</div>
            <p className="text-slate-400">No active orders. You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.map(order => (
              <div key={order.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-mono text-purple-300 text-sm">#{generateOrderShortId(order.id)}</p>
                    <p className="text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">📦 Pickup</p>
                    <p className="text-sm font-medium">{order.pickupZone?.name}</p>
                    <p className="text-xs text-slate-400 leading-tight">{order.pickupAddress.slice(0, 60)}...</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">📍 Drop</p>
                    <p className="text-sm font-medium">{order.dropZone?.name}</p>
                    <p className="text-xs text-slate-400 leading-tight">{order.dropAddress.slice(0, 60)}...</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-slate-400">Customer: </span>
                    <span className="font-medium">{order.customer.name}</span>
                    {order.customer.phone && <span className="text-slate-500"> · {order.customer.phone}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-purple-300">{formatCurrency(order.totalCharge)}</span>
                    {order.paymentType === 'COD' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400">COD</span>
                    )}
                    <Link href={`/agent/orders/${order.id}`} className="btn-primary py-1.5 px-3 text-xs">
                      Manage →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
