import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate, generateOrderShortId, getStatusColor, getStatusIcon } from '@/lib/utils'
import AdminOrderActions from './AdminOrderActions'

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [order, agents] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        agent: { select: { id: true, name: true, phone: true } },
        pickupZone: true,
        dropZone: true,
        trackingEvents: {
          include: { actor: { select: { name: true, role: true } } },
          orderBy: { timestamp: 'asc' },
        },
      },
    }),
    prisma.agentProfile.findMany({
      where: { isAvailable: true },
      include: { user: { select: { id: true, name: true } } },
    }),
  ])

  if (!order) notFound()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/orders" className="btn-secondary py-2 px-3 text-sm">← Back</Link>
        <div>
          <h1 className="text-2xl font-bold">
            Order <span className="gradient-text font-mono">#{generateOrderShortId(order.id)}</span>
          </h1>
          <p className="text-slate-400 text-sm">{formatDate(order.createdAt)}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="md:col-span-2 space-y-4">
          {/* Customer */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">👤 Customer</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center font-bold">
                {order.customer.name[0]}
              </div>
              <div>
                <p className="font-medium">{order.customer.name}</p>
                <p className="text-sm text-slate-400">{order.customer.email}</p>
                {order.customer.phone && <p className="text-sm text-slate-400">{order.customer.phone}</p>}
              </div>
            </div>
          </div>

          {/* Route */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">📍 Route</h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Pickup · Zone: {order.pickupZone?.name || '—'}</p>
                  <p className="text-sm">{order.pickupAddress}</p>
                  <p className="text-xs text-slate-600">({order.pickupLat.toFixed(4)}, {order.pickupLng.toFixed(4)})</p>
                </div>
              </div>
              <div className="ml-1 border-l border-dashed border-slate-700 h-4" />
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-purple-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Drop · Zone: {order.dropZone?.name || '—'}</p>
                  <p className="text-sm">{order.dropAddress}</p>
                  <p className="text-xs text-slate-600">({order.dropLat.toFixed(4)}, {order.dropLng.toFixed(4)})</p>
                </div>
              </div>
            </div>
          </div>

          {/* Package & Charges */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">📦 Package</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Dimensions</span><span>{order.packageLength}×{order.packageBreadth}×{order.packageHeight} cm</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Actual</span><span>{order.actualWeight} kg</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Volumetric</span><span>{order.volumetricWeight} kg</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Billed</span><span className="text-purple-300 font-medium">{order.billedWeight} kg</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Type</span><span>{order.orderType} · {order.paymentType}</span></div>
              </div>
            </div>
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">💰 Charges</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Base Charge</span><span>{formatCurrency(order.baseCharge)}</span></div>
                {order.codSurcharge > 0 && <div className="flex justify-between"><span className="text-orange-400">COD Surcharge</span><span className="text-orange-400">{formatCurrency(order.codSurcharge)}</span></div>}
                <div className="flex justify-between font-bold mt-2 pt-2 border-t border-purple-500/20"><span className="gradient-text">Total</span><span className="gradient-text">{formatCurrency(order.totalCharge)}</span></div>
                {order.codCollected && <div className="text-green-400 text-xs">✓ COD Collected</div>}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-5">📍 Tracking History</h2>
            {order.trackingEvents.map((event, idx) => (
              <div key={event.id} className="timeline-item">
                <div className={`timeline-dot ${getStatusColor(event.status)}`}>
                  {getStatusIcon(event.status)}
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-medium text-sm">{event.status.replace(/_/g, ' ')}</p>
                  {event.notes && <p className="text-xs text-slate-400 mt-0.5">{event.notes}</p>}
                  <p className="text-xs text-slate-600 mt-1">{formatDate(event.timestamp)}</p>
                  {event.actor && <p className="text-xs text-slate-600">by {event.actor.name} ({event.actorRole})</p>}
                </div>
                {idx === order.trackingEvents.length - 1 && (
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full self-start mt-1">Latest</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Admin Actions */}
        <div>
          <AdminOrderActions order={order} agents={agents} />
        </div>
      </div>
    </div>
  )
}
