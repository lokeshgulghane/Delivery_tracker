import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'

export const metadata = { title: 'My Orders — Agent' }

export default async function AgentOrdersPage() {
  const session = await auth()

  const orders = await prisma.order.findMany({
    where: { agentId: session!.user.id },
    include: {
      customer: { select: { name: true } },
      pickupZone: { select: { name: true } },
      dropZone: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">My Orders</h1>
        <p className="text-slate-400 mt-1">{orders.length} total orders assigned</p>
      </div>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-slate-400">No orders assigned yet.</p>
        </div>
      ) : (
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
                  <th>Charge</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td className="font-mono text-purple-300 text-xs">#{generateOrderShortId(order.id)}</td>
                    <td className="text-sm">{order.customer.name}</td>
                    <td>
                      <div className="text-xs">
                        <p className="text-slate-300">{order.pickupZone?.name || '—'}</p>
                        <p className="text-slate-500">→ {order.dropZone?.name || '—'}</p>
                      </div>
                    </td>
                    <td className="text-xs">
                      <span className={order.paymentType === 'COD' ? 'text-orange-400 font-semibold' : 'text-slate-400'}>{order.paymentType}</span>
                    </td>
                    <td><StatusBadge status={order.status} /></td>
                    <td className="font-semibold text-purple-300 text-sm">{formatCurrency(order.totalCharge)}</td>
                    <td className="text-xs text-slate-500">{formatDate(order.updatedAt)}</td>
                    <td>
                      {!['DELIVERED', 'FAILED'].includes(order.status) && (
                        <Link href={`/agent/orders/${order.id}`} className="text-xs text-purple-400 hover:text-purple-300">
                          Update →
                        </Link>
                      )}
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
