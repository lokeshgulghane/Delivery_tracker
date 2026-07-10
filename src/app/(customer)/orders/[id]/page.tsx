import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId, getStatusColor, getStatusIcon } from '@/lib/utils'
import RescheduleButton from './RescheduleButton'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      agent: { select: { name: true, phone: true } },
      pickupZone: true,
      dropZone: true,
      trackingEvents: {
        include: { actor: { select: { name: true, role: true } } },
        orderBy: { timestamp: 'asc' },
      },
    },
  })

  if (!order || order.customerId !== session!.user.id) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/orders" className="btn-secondary py-2 px-3 text-sm">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold">
            Order <span className="gradient-text font-mono">#{generateOrderShortId(order.id)}</span>
          </h1>
          <p className="text-slate-400 text-sm">{formatDate(order.createdAt)}</p>
        </div>
        <div className="ml-auto">
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Route */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">📍 Delivery Route</h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Pickup · {order.pickupZone?.name}</p>
                  <p className="text-sm text-slate-200">{order.pickupAddress}</p>
                </div>
              </div>
              <div className="ml-1 border-l border-dashed border-slate-600 h-4" />
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Drop · {order.dropZone?.name}</p>
                  <p className="text-sm text-slate-200">{order.dropAddress}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Package */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">📦 Package</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Dimensions', value: `${order.packageLength}×${order.packageBreadth}×${order.packageHeight} cm` },
                { label: 'Actual Weight', value: `${order.actualWeight} kg` },
                { label: 'Volumetric Weight', value: `${order.volumetricWeight} kg` },
                { label: 'Billed Weight', value: `${order.billedWeight} kg`, highlight: true },
                { label: 'Order Type', value: order.orderType },
                { label: 'Payment', value: order.paymentType },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-slate-500">{row.label}</p>
                  <p className={row.highlight ? 'font-semibold text-purple-300' : 'text-slate-200'}>{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charge */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">💰 Charges</h2>
            <div className="space-y-0">
              <div className="charge-row">
                <span className="text-slate-400">Delivery Charge</span>
                <span>{formatCurrency(order.baseCharge)}</span>
              </div>
              {order.codSurcharge > 0 && (
                <div className="charge-row">
                  <span className="text-orange-400">COD Surcharge</span>
                  <span className="text-orange-400">+ {formatCurrency(order.codSurcharge)}</span>
                </div>
              )}
              <div className="charge-row total">
                <span className="gradient-text">Total</span>
                <span className="gradient-text">{formatCurrency(order.totalCharge)}</span>
              </div>
            </div>
          </div>

          {/* Agent */}
          {order.agent && (
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">🛵 Delivery Agent</h2>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-600 to-teal-600 flex items-center justify-center text-sm font-bold">
                  {order.agent.name[0]}
                </div>
                <div>
                  <p className="font-medium">{order.agent.name}</p>
                  <p className="text-sm text-slate-400">{order.agent.phone || 'No phone'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Reschedule */}
          {order.status === 'FAILED' && (
            <RescheduleButton orderId={order.id} />
          )}
        </div>

        {/* Right column: Tracking Timeline */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-6">📍 Tracking Timeline</h2>
          <div>
            {order.trackingEvents.map((event, idx) => (
              <div key={event.id} className="timeline-item">
                <div className={`timeline-dot ${getStatusColor(event.status)}`}>
                  {getStatusIcon(event.status)}
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-medium text-sm">{event.status.replace(/_/g, ' ')}</p>
                  {event.notes && <p className="text-xs text-slate-400 mt-0.5">{event.notes}</p>}
                  <p className="text-xs text-slate-600 mt-1">{formatDate(event.timestamp)}</p>
                  {event.actor && (
                    <p className="text-xs text-slate-600">
                      by {event.actor.name} ({event.actor.role})
                    </p>
                  )}
                </div>
                {idx === order.trackingEvents.length - 1 && (
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full self-start mt-1">Latest</span>
                )}
              </div>
            ))}
          </div>

          {order.scheduledDate && (
            <div className="mt-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm text-orange-300">
              📅 Rescheduled for: {new Date(order.scheduledDate).toLocaleDateString('en-IN')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
