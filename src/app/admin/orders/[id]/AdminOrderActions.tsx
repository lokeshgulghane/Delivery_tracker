'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { OrderStatus } from '@prisma/client'

interface Agent {
  id: string
  isAvailable: boolean
  user: { id: string; name: string }
  currentZone?: { name: string } | null
}

interface Order {
  id: string
  status: OrderStatus
  agentId: string | null
  agent: { name: string } | null
}

const ALL_STATUSES: OrderStatus[] = [
  'PENDING','ASSIGNED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RESCHEDULED'
]

export default function AdminOrderActions({ order, agents }: { order: Order; agents: Agent[] }) {
  const router = useRouter()
  const [selectedAgent, setSelectedAgent] = useState(order.agentId || '')
  const [overrideStatus, setOverrideStatus] = useState<OrderStatus | ''>('')
  const [overrideNotes, setOverrideNotes] = useState('')
  const [loading, setLoading] = useState<string | null>(null)

  async function autoAssign() {
    setLoading('auto')
    try {
      const res = await fetch(`/api/orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`Auto-assigned to ${data.agentName} (${data.distance} km away)`)
      router.refresh()
    } catch { toast.error('Auto-assign failed') } finally { setLoading(null) }
  }

  async function manualAssign() {
    if (!selectedAgent) { toast.error('Select an agent first'); return }
    setLoading('manual')
    try {
      const res = await fetch(`/api/orders/${order.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Agent assigned successfully')
      router.refresh()
    } catch { toast.error('Assignment failed') } finally { setLoading(null) }
  }

  async function overrideOrderStatus() {
    if (!overrideStatus) { toast.error('Select a status'); return }
    setLoading('status')
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: overrideStatus, notes: overrideNotes || 'Admin override' }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success(`Status updated to ${overrideStatus}`)
      setOverrideNotes('')
      router.refresh()
    } catch { toast.error('Status update failed') } finally { setLoading(null) }
  }

  return (
    <div className="space-y-4">
      {/* Current Agent */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">🛵 Agent Assignment</h3>
        {order.agent ? (
          <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300">
            Currently: {order.agent.name}
          </div>
        ) : (
          <div className="mb-3 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-300">
            No agent assigned
          </div>
        )}

        <button
          onClick={autoAssign}
          disabled={!!loading || order.status === 'DELIVERED'}
          className="btn-primary w-full justify-center mb-3 text-sm"
        >
          {loading === 'auto' ? '⏳' : '🤖'} Auto-Assign Nearest
        </button>

        <div className="relative">
          <label className="label">Or select manually:</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="select mb-2"
          >
            <option value="">— Pick an agent —</option>
            {agents.map(a => (
              <option key={a.id} value={a.user.id}>
                {a.user.name} {a.currentZone ? `(${(a.currentZone as { name: string }).name})` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={manualAssign}
            disabled={!!loading || !selectedAgent || order.status === 'DELIVERED'}
            className="btn-secondary w-full justify-center text-sm"
          >
            {loading === 'manual' ? '⏳' : '✓'} Assign Agent
          </button>
        </div>
      </div>

      {/* Status Override */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">⚙️ Override Status</h3>
        <p className="text-xs text-slate-500 mb-3">Admin can override any order status regardless of lifecycle rules.</p>

        <select
          value={overrideStatus}
          onChange={(e) => setOverrideStatus(e.target.value as OrderStatus)}
          className="select mb-2"
        >
          <option value="">— Select status —</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <input
          type="text"
          value={overrideNotes}
          onChange={(e) => setOverrideNotes(e.target.value)}
          placeholder="Reason for override..."
          className="input mb-2"
        />

        <button
          onClick={overrideOrderStatus}
          disabled={!!loading || !overrideStatus}
          className="btn-danger w-full justify-center text-sm"
        >
          {loading === 'status' ? '⏳' : '⚙️'} Apply Override
        </button>
      </div>
    </div>
  )
}
