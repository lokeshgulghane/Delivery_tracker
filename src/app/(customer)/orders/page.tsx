import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'

export const metadata = { title: 'My Orders — DeliveryTracker' }

export default async function OrdersListPage() {
  const session = await auth()

  const orders = await prisma.order.findMany({
    where: { customerId: session!.user.id },
    include: {
      pickupZone: { select: { name: true } },
      dropZone: { select: { name: true } },
      agent: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Orders</h1>
          <p className="text-slate-400 mt-1">{orders.length} total order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/orders/new" className="btn-primary">+ New Order</Link>
      </div>

      {orders.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📦</div>
          <p className="text-slate-400 mb-6">No orders yet. Start your first delivery!</p>
          <Link href="/orders/new" className="btn-primary inline-flex">+ Place Order</Link>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>From → To</th>
                  <th>Type</th>
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
                    <td className="font-mono text-purple-300 text-xs">#{generateOrderShortId(order.id)}</td>
                    <td>
                      <div className="text-xs">
                        <p className="text-slate-300">{order.pickupZone?.name || '—'}</p>
                        <p className="text-slate-500">→ {order.dropZone?.name || '—'}</p>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs">
                        <p>{order.orderType}</p>
                        <p className="text-slate-500">{order.paymentType}</p>
                      </div>
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td className="text-slate-400 text-sm">{order.agent?.name || '—'}</td>
                    <td className="font-semibold text-purple-300">{formatCurrency(order.totalCharge)}</td>
                    <td className="text-slate-400 text-xs whitespace-nowrap">{formatDate(order.createdAt)}</td>
                    <td>
                      <Link href={`/orders/${order.id}`} className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap">
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
  )
}
