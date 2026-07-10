'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { OrderStatus } from '@prisma/client'

const STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  PICKED_UP: '📦 Mark as Picked Up',
  IN_TRANSIT: '🚚 Mark as In Transit',
  OUT_FOR_DELIVERY: '🏃 Mark Out for Delivery',
  DELIVERED: '✅ Mark as Delivered',
  FAILED: '❌ Mark as Failed',
}

export default function AgentStatusUpdater({
  orderId,
  nextStatuses,
  isCodOrder,
  codCollected,
}: {
  orderId: string
  nextStatuses: OrderStatus[]
  isCodOrder: boolean
  codCollected: boolean
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [codCheck, setCodCheck] = useState(false)
  const router = useRouter()

  async function updateStatus(status: OrderStatus) {
    if (status === OrderStatus.DELIVERED && isCodOrder && !codCheck) {
      toast.error('Please confirm COD collected before marking as delivered')
      return
    }

    setLoading(status)
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          notes: notes || undefined,
          codCollected: status === OrderStatus.DELIVERED && isCodOrder ? codCheck : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`Status updated to ${status.replace(/_/g, ' ')}`)
      router.refresh()
    } catch { toast.error('Failed to update status') } finally { setLoading(null) }
  }

  return (
    <div className="card border-purple-500/40">
      <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-4">⚡ Update Status</h2>

      <div className="mb-3">
        <label className="label">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Customer not home, left at door..."
          className="input"
        />
      </div>

      {/* COD check */}
      {isCodOrder && nextStatuses.includes(OrderStatus.DELIVERED) && !codCollected && (
        <label className="flex items-center gap-3 mb-4 cursor-pointer p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
          <input
            type="checkbox"
            checked={codCheck}
            onChange={(e) => setCodCheck(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm text-orange-300 font-medium">✓ I have collected the COD amount from the customer</span>
        </label>
      )}

      <div className="space-y-2">
        {nextStatuses.map(status => {
          const isDanger = status === OrderStatus.FAILED
          return (
            <button
              key={status}
              onClick={() => updateStatus(status)}
              disabled={!!loading}
              className={`w-full justify-center py-3 text-sm font-semibold ${isDanger ? 'btn-danger' : 'btn-primary'}`}
            >
              {loading === status ? '⏳ Updating...' : STATUS_LABELS[status] || status}
            </button>
          )
        })}
      </div>
    </div>
  )
}
