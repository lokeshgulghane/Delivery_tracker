import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId, getStatusColor, getStatusIcon } from '@/lib/utils'
import AgentStatusUpdater from './AgentStatusUpdater'
import { OrderStatus } from '@prisma/client'

export default async function AgentOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      pickupZone: true,
      dropZone: true,
      trackingEvents: {
        include: { actor: { select: { name: true } } },
        orderBy: { timestamp: 'asc' },
      },
      notifications: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!order || order.agentId !== session!.user.id) notFound()

  // Determine valid next statuses for this agent
  const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.ASSIGNED]: [OrderStatus.PICKED_UP],
    [OrderStatus.PICKED_UP]: [OrderStatus.IN_TRANSIT],
    [OrderStatus.IN_TRANSIT]: [OrderStatus.OUT_FOR_DELIVERY],
    [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.FAILED],
  }
  const nextStatuses = VALID_TRANSITIONS[order.status] || []

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/agent/orders" className="btn-secondary py-2 px-3 text-sm">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold">Order <span className="gradient-text font-mono">#{generateOrderShortId(order.id)}</span></h1>
          <p className="text-slate-400 text-sm">{formatDate(order.createdAt)}</p>
        </div>
        <div className="ml-auto"><StatusBadge status={order.status} /></div>
      </div>

      <div className="space-y-4">
        {/* Customer */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">👤 Customer</h2>
          <p className="font-medium">{order.customer.name}</p>
          <p className="text-sm text-slate-400">{order.customer.phone || order.customer.email}</p>
        </div>

        {/* Route */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">📍 Delivery Route</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-green-400 font-semibold mb-1">📦 PICKUP — {order.pickupZone?.name}</p>
              <p className="text-sm bg-green-500/10 border border-green-500/20 rounded-lg p-3">{order.pickupAddress}</p>
            </div>
            <div>
              <p className="text-xs text-purple-400 font-semibold mb-1">📍 DROP — {order.dropZone?.name}</p>
              <p className="text-sm bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">{order.dropAddress}</p>
            </div>
          </div>
        </div>

        {/* Package */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">📦 Package Info</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-xs text-slate-500">Dimensions</p><p>{order.packageLength}×{order.packageBreadth}×{order.packageHeight} cm</p></div>
            <div><p className="text-xs text-slate-500">Weight</p><p>{order.billedWeight} kg</p></div>
            <div><p className="text-xs text-slate-500">Payment</p><p className={order.paymentType === 'COD' ? 'text-orange-400 font-bold' : ''}>{order.paymentType}</p></div>
          </div>
          {order.paymentType === 'COD' && (
            <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm font-bold text-orange-400">💵 Collect {formatCurrency(order.totalCharge)} on delivery</p>
              {order.codCollected && <p className="text-xs text-green-400 mt-1">✓ COD Collected</p>}
            </div>
          )}
        </div>

        {/* Status Updater */}
        {nextStatuses.length > 0 && (
          <AgentStatusUpdater
            orderId={order.id}
            nextStatuses={nextStatuses}
            isCodOrder={order.paymentType === 'COD'}
            codCollected={order.codCollected}
          />
        )}

        {/* Timeline */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-5">📍 History</h2>
          {order.trackingEvents.map((event) => {
            const notif = order.notifications.find(
              (n) => n.message === `Status updated to ${event.status}`
            )

            return (
              <div key={event.id} className="timeline-item">
                <div className={`timeline-dot text-xs ${getStatusColor(event.status)}`}>
                  {getStatusIcon(event.status)}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{event.status.replace(/_/g, ' ')}</span>
                    {notif && (
                      <>
                        {notif.status === 'SENT' && (
                          <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/25 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold">
                            📧 Mail Sent
                          </span>
                        )}
                        {notif.status === 'FAILED' && (
                          <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/25 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold">
                            📧 Mail Failed
                          </span>
                        )}
                        {notif.status === 'PENDING' && (
                          <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold animate-pulse">
                            📧 Mail Pending
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {event.notes && <p className="text-xs text-slate-400 mt-0.5">{event.notes}</p>}
                  <p className="text-xs text-slate-600 mt-1">{formatDate(event.timestamp)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
