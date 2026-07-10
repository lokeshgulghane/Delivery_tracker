'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Customer { id: string; name: string; email: string }
interface Zone { id: string; name: string }

export default function AdminCreateOrderForm({
  customers, zones, adminId
}: { customers: Customer[]; zones: Zone[]; adminId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<null | { totalCharge: number; billedWeight: number; volumetricWeight: number; baseCharge: number; codSurcharge: number; rateCardName: string; error?: string }>(null)

  const [form, setForm] = useState({
    customerId: '',
    pickupAddress: '', dropAddress: '',
    packageLength: '', packageBreadth: '', packageHeight: '',
    actualWeight: '',
    orderType: 'B2C', paymentType: 'PREPAID',
    notes: '',
  })

  function update(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  async function calcPreview() {
    if (!form.customerId || !form.pickupAddress || !form.dropAddress || !form.actualWeight) {
      toast.error('Fill in customer, addresses and weight first'); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/orders/charge-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: form.pickupAddress,
          dropAddress: form.dropAddress,
          packageLength: parseFloat(form.packageLength) || 10,
          packageBreadth: parseFloat(form.packageBreadth) || 10,
          packageHeight: parseFloat(form.packageHeight) || 10,
          actualWeight: parseFloat(form.actualWeight),
          orderType: form.orderType,
          paymentType: form.paymentType,
        }),
      })
      const data = await res.json()
      setPreview(data)
      if (data.error) toast.error(data.error)
    } catch { toast.error('Preview failed') } finally { setLoading(false) }
  }

  async function createOrder(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          packageLength: parseFloat(form.packageLength) || 10,
          packageBreadth: parseFloat(form.packageBreadth) || 10,
          packageHeight: parseFloat(form.packageHeight) || 10,
          actualWeight: parseFloat(form.actualWeight),
          createdByAdmin: adminId,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Order created!')
      router.push(`/admin/orders/${data.id}`)
    } catch { toast.error('Failed to create order') } finally { setLoading(false) }
  }

  const inputFilled = form.customerId && form.pickupAddress && form.dropAddress && form.actualWeight

  return (
    <form onSubmit={createOrder} className="space-y-5">
      {/* Customer */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gold-muted uppercase tracking-wide mb-4">👤 Customer</h2>
        <label className="label">Select Customer *</label>
        <select value={form.customerId} onChange={e => update('customerId', e.target.value)} className="select" required>
          <option value="">— Choose a customer —</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
          ))}
        </select>
      </div>

      {/* Addresses */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gold-muted uppercase tracking-wide mb-4">📍 Addresses</h2>
        <div className="space-y-3">
          <div>
            <label className="label">Pickup Address *</label>
            <input type="text" value={form.pickupAddress} onChange={e => update('pickupAddress', e.target.value)} className="input" placeholder="e.g. Andheri East, Mumbai 400069" required />
          </div>
          <div>
            <label className="label">Drop Address *</label>
            <input type="text" value={form.dropAddress} onChange={e => update('dropAddress', e.target.value)} className="input" placeholder="e.g. Koregaon Park, Pune 411001" required />
          </div>
        </div>
      </div>

      {/* Package */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gold-muted uppercase tracking-wide mb-4">📦 Package Details</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Actual Weight (kg) *</label>
            <input type="number" value={form.actualWeight} onChange={e => update('actualWeight', e.target.value)} className="input" placeholder="2.5" min="0.01" step="0.01" required />
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-3">
            {['Length','Breadth','Height'].map((dim, i) => {
              const key = ['packageLength','packageBreadth','packageHeight'][i]
              return (
                <div key={dim}>
                  <label className="label">{dim} (cm)</label>
                  <input type="number" value={(form as Record<string,string>)[key]} onChange={e => update(key, e.target.value)} className="input" placeholder="30" min="1" step="1" />
                </div>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Order Type</label>
            <select value={form.orderType} onChange={e => update('orderType', e.target.value)} className="select">
              <option value="B2C">B2C</option>
              <option value="B2B">B2B</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Type</label>
            <select value={form.paymentType} onChange={e => update('paymentType', e.target.value)} className="select">
              <option value="PREPAID">Prepaid</option>
              <option value="COD">COD</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <label className="label">Notes (optional)</label>
        <input type="text" value={form.notes} onChange={e => update('notes', e.target.value)} className="input" placeholder="Special handling instructions..." />
      </div>

      {/* Preview */}
      <button type="button" onClick={calcPreview} disabled={!inputFilled || loading} className="btn-secondary w-full justify-center">
        {loading ? '⏳ Calculating...' : '🔍 Preview Charges'}
      </button>

      {preview && (
        <div className="card" style={{ borderColor: preview.error ? 'rgba(248,113,113,0.4)' : 'rgba(212,160,23,0.4)' }}>
          <h3 className="font-semibold mb-3 text-gold-primary">{preview.error ? '⚠️ Pricing Issue' : '💰 Charge Breakdown'}</h3>
          {preview.error ? (
            <p className="text-red-400 text-sm">{preview.error}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="charge-row"><span className="text-gold-muted">Rate Card</span><span>{preview.rateCardName}</span></div>
              <div className="charge-row"><span className="text-gold-muted">Volumetric Weight</span><span>{preview.volumetricWeight} kg</span></div>
              <div className="charge-row"><span className="text-gold-muted">Billed Weight</span><span className="text-gold-primary font-medium">{preview.billedWeight} kg</span></div>
              <div className="charge-row"><span className="text-gold-muted">Base Charge</span><span>₹{preview.baseCharge}</span></div>
              {preview.codSurcharge > 0 && <div className="charge-row"><span className="text-orange-400">COD Surcharge</span><span className="text-orange-400">₹{preview.codSurcharge}</span></div>}
              <div className="charge-row total"><span className="gradient-text">Total</span><span className="gradient-text text-xl">₹{preview.totalCharge}</span></div>
            </div>
          )}
        </div>
      )}

      <button type="submit" disabled={!inputFilled || loading} className="btn-primary w-full justify-center py-3 text-base">
        {loading ? '⏳ Creating Order...' : '✓ Create Order'}
      </button>
    </form>
  )
}
