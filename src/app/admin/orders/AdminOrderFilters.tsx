'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { OrderStatus } from '@prisma/client'

const ALL_STATUSES: OrderStatus[] = [
  'PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED'
]

interface Zone { id: string; name: string }

export default function AdminOrderFilters({
  zones,
  currentStatus,
  currentZoneId,
}: {
  zones: Zone[]
  currentStatus?: string
  currentZoneId?: string
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    router.push(`/admin/orders?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={currentStatus || ''}
        onChange={(e) => applyFilter('status', e.target.value)}
        className="select w-auto"
      >
        <option value="">All Statuses</option>
        {ALL_STATUSES.map(s => (
          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
        ))}
      </select>

      <select
        value={currentZoneId || ''}
        onChange={(e) => applyFilter('zoneId', e.target.value)}
        className="select w-auto"
      >
        <option value="">All Zones</option>
        {zones.map(z => (
          <option key={z.id} value={z.id}>{z.name}</option>
        ))}
      </select>

      {(currentStatus || currentZoneId) && (
        <button onClick={() => router.push('/admin/orders')} className="btn-secondary py-2 px-3 text-sm">
          ✕ Clear Filters
        </button>
      )}
    </div>
  )
}
