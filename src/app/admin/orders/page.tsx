import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId } from '@/lib/utils'
import AdminOrderFilters from './AdminOrderFilters'
import { OrderStatus } from '@prisma/client'

export const metadata = { title: 'All Orders — Admin' }

interface Props {
  searchParams: Promise<{ status?: string; zoneId?: string; page?: string }>
}

export default async function AdminOrdersPage({ searchParams }: Props) {
  const sp = await searchParams
  const status = sp.status as OrderStatus | undefined
  const zoneId = sp.zoneId
  const page = parseInt(sp.page || '1')
  const limit = 20

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (zoneId) where.pickupZoneId = zoneId

  const [orders, total, zones] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true } },
        agent: { select: { name: true } },
        pickupZone: { select: { name: true } },
        dropZone: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
    prisma.zone.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">All Orders</h1>
          <p className="text-slate-400 mt-1">{total} order{total !== 1 ? 's' : ''} found</p>
        </div>
        <Link href="/admin/orders/new" className="btn-primary">+ Create Order</Link>
      </div>

      {/* Filters */}
      <AdminOrderFilters zones={zones} currentStatus={status} currentZoneId={zoneId} />

      {/* Table */}
      <div className="card p-0 overflow-hidden mt-4">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Type / Payment</th>
                <th>Status</th>
                <th>Agent</th>
                <th>Charge</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-500">No orders found</td></tr>
              ) : orders.map(order => (
                <tr key={order.id}>
                  <td className="font-mono text-purple-300 text-xs">#{generateOrderShortId(order.id)}</td>
                  <td>
                    <div className="text-sm">
                      <p className="font-medium">{order.customer.name}</p>
                      <p className="text-slate-500 text-xs">{order.customer.email}</p>
                    </div>
                  </td>
                  <td>
                    <div className="text-xs">
                      <p className="text-slate-300">{order.pickupZone?.name || '—'}</p>
                      <p className="text-slate-500">→ {order.dropZone?.name || '—'}</p>
                    </div>
                  </td>
                  <td>
                    <div className="text-xs">
                      <span className="text-blue-400">{order.orderType}</span>
                      <span className="text-slate-500"> · {order.paymentType}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={order.status} /></td>
                  <td className="text-sm text-slate-400">{order.agent?.name || <span className="text-yellow-500 text-xs">Unassigned</span>}</td>
                  <td className="font-semibold text-purple-300 text-sm">{formatCurrency(order.totalCharge)}</td>
                  <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(order.createdAt)}</td>
                  <td>
                    <Link href={`/admin/orders/${order.id}`} className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap">
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {page > 1 && (
            <Link href={`/admin/orders?page=${page - 1}${status ? `&status=${status}` : ''}`} className="btn-secondary px-3 py-1.5 text-sm">
              ← Prev
            </Link>
          )}
          <span className="text-slate-400 text-sm">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/admin/orders?page=${page + 1}${status ? `&status=${status}` : ''}`} className="btn-secondary px-3 py-1.5 text-sm">
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
