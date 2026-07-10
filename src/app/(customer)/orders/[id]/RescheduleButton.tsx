'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function RescheduleButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  async function handleReschedule() {
    if (!date) { toast.error('Please select a date'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: new Date(date).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Delivery rescheduled! A new agent will be assigned.')
      router.refresh()
    } catch {
      toast.error('Failed to reschedule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card border-red-500/20">
      <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-3">⚠️ Delivery Failed</h2>
      <p className="text-sm text-slate-400 mb-4">
        Your delivery attempt was unsuccessful. You can reschedule for a new date and a fresh agent will be assigned.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full justify-center">
          📅 Reschedule Delivery
        </button>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Select New Delivery Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={minDate}
              className="input"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={handleReschedule} disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? '⏳' : '✓ Confirm Reschedule'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
