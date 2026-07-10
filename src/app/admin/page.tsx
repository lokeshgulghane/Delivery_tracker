import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'
import { OrderStatus } from '@prisma/client'

export const metadata = { title: 'Admin Dashboard — DeliveryTracker' }

const STATUS_ORDER: OrderStatus[] = [
  'PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED'
]

export default async function AdminDashboard() {
  const [
    totalOrders, pendingOrders, deliveredOrders, failedOrders,
    revenue, activeAgents, totalCustomers, ordersByStatus, recentOrders
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
    prisma.order.count({ where: { status: 'FAILED' } }),
    prisma.order.aggregate({ _sum: { totalCharge: true }, where: { status: 'DELIVERED' } }),
    prisma.agentProfile.count({ where: { isAvailable: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.order.groupBy({ by: ['status'], _count: { status: true } }),
    prisma.order.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        agent: { select: { name: true } },
        pickupZone: { select: { name: true } },
        dropZone: { select: { name: true } },
      },
    }),
  ])

  const statusMap = Object.fromEntries(ordersByStatus.map(s => [s.status, s._count.status]))

  const statCards = [
    { label: 'Total Orders', value: totalOrders, icon: '📦', color: 'from-purple-600 to-indigo-600' },
    { label: 'Pending', value: pendingOrders, icon: '⏳', color: 'from-yellow-600 to-orange-600' },
    { label: 'Delivered', value: deliveredOrders, icon: '✅', color: 'from-green-600 to-teal-600' },
    { label: 'Failed', value: failedOrders, icon: '❌', color: 'from-red-600 to-rose-600' },
    { label: 'Revenue', value: formatCurrency(revenue._sum.totalCharge || 0), icon: '💰', color: 'from-blue-600 to-cyan-600' },
    { label: 'Active Agents', value: activeAgents, icon: '🛵', color: 'from-violet-600 to-purple-600' },
    { label: 'Customers', value: totalCustomers, icon: '👤', color: 'from-slate-600 to-gray-600' },
    { label: 'Success Rate', value: totalOrders > 0 ? `${Math.round((deliveredOrders / totalOrders) * 100)}%` : '—', icon: '📈', color: 'from-emerald-600 to-green-600' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-slate-400 mt-1">Platform overview and operations control</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-xl mb-3`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold gradient-text">{stat.value}</p>
            <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Status Distribution */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="card md:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Orders by Status</h2>
          <div className="space-y-3">
            {STATUS_ORDER.map(status => {
              const count = statusMap[status] || 0
              const pct = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0
              return (
                <div key={status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">{status.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card md:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/admin/orders/new', icon: '➕', label: 'Create Order', desc: 'Create on behalf of customer' },
              { href: '/admin/zones', icon: '🗺️', label: 'Manage Zones', desc: 'Draw & edit delivery zones' },
              { href: '/admin/rate-cards', icon: '💰', label: 'Rate Cards', desc: 'Configure B2B/B2C pricing' },
              { href: '/admin/agents', icon: '🛵', label: 'View Agents', desc: 'Monitor agent availability' },
            ].map(action => (
              <Link key={action.href} href={action.href} className="p-4 rounded-xl border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group">
                <div className="text-2xl mb-2">{action.icon}</div>
                <p className="font-semibold text-sm group-hover:text-purple-300 transition-colors">{action.label}</p>
                <p className="text-xs text-slate-500 mt-1">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Orders</h2>
          <Link href="/admin/orders" className="text-sm text-purple-400 hover:text-purple-300">View all →</Link>
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Route</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Charge</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id}>
                    <td className="font-mono text-purple-300 text-xs">#{generateOrderShortId(order.id)}</td>
                    <td className="text-sm">{order.customer.name}</td>
                    <td>
                      <div className="text-xs">
                        <p className="text-slate-300">{order.pickupZone?.name || '—'}</p>
                        <p className="text-slate-500">→ {order.dropZone?.name || '—'}</p>
                      </div>
                    </td>
                    <td className="text-xs text-slate-400">{order.orderType}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td className="text-sm text-slate-400">{order.agent?.name || '—'}</td>
                    <td className="font-semibold text-purple-300 text-sm">{formatCurrency(order.totalCharge)}</td>
                    <td className="text-xs text-slate-500">{formatDate(order.createdAt)}</td>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className="text-xs text-purple-400 hover:text-purple-300">
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
