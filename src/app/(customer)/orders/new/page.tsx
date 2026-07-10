'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

interface ChargePreview {
  pickupZone: { id: string; name: string }
  dropZone: { id: string; name: string }
  charge: {
    volumetricWeight: number
    billedWeight: number
    isIntraZone: boolean
    rateCardName: string
    baseRate: number
    baseCharge: number
    codSurcharge: number
    totalCharge: number
  }
}

const STEPS = ['Package Details', 'Charge Preview', 'Confirm Order']

export default function NewOrderPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ChargePreview | null>(null)

  const [form, setForm] = useState({
    pickupAddress: '',
    dropAddress: '',
    packageLength: '',
    packageBreadth: '',
    packageHeight: '',
    actualWeight: '',
    orderType: 'B2C' as 'B2B' | 'B2C',
    paymentType: 'PREPAID' as 'PREPAID' | 'COD',
    notes: '',
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function getPreview() {
    setLoading(true)
    try {
      const res = await fetch('/api/orders/charge-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          packageLength: parseFloat(form.packageLength),
          packageBreadth: parseFloat(form.packageBreadth),
          packageHeight: parseFloat(form.packageHeight),
          actualWeight: parseFloat(form.actualWeight),
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      setPreview(data)
      setStep(1)
    } catch {
      toast.error('Failed to calculate charge. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function confirmOrder() {
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          packageLength: parseFloat(form.packageLength),
          packageBreadth: parseFloat(form.packageBreadth),
          packageHeight: parseFloat(form.packageHeight),
          actualWeight: parseFloat(form.actualWeight),
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('Order placed successfully! 🎉')
      router.push(`/orders/${data.id}`)
    } catch {
      toast.error('Failed to place order.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-6">New Delivery Order</h1>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`step-circle ${
                i < step ? 'bg-green-500 border-green-500 text-white' :
                i === step ? 'bg-purple-600 border-purple-600 text-white' :
                'border-slate-600 text-slate-600 bg-transparent border-2'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm hidden md:block ${i === step ? 'text-white font-medium' : 'text-slate-500'}`}>{s}</span>
              {i < STEPS.length - 1 && (
                <div className={`step-line ${i < step ? 'bg-green-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Package Details */}
      {step === 0 && (
        <div className="card-elevated animate-fade-in space-y-5">
          <h2 className="text-lg font-semibold mb-2">📍 Addresses</h2>

          <div>
            <label className="label">Pickup Address *</label>
            <input
              type="text"
              value={form.pickupAddress}
              onChange={(e) => update('pickupAddress', e.target.value)}
              className="input"
              placeholder="Full pickup address with area and city"
              required
            />
          </div>

          <div>
            <label className="label">Drop Address *</label>
            <input
              type="text"
              value={form.dropAddress}
              onChange={(e) => update('dropAddress', e.target.value)}
              className="input"
              placeholder="Full delivery address with area and city"
              required
            />
          </div>

          <hr className="border-purple-500/10" />
          <h2 className="text-lg font-semibold">📦 Package Details</h2>

          <div className="grid grid-cols-3 gap-3">
            {[
              { field: 'packageLength', label: 'Length (cm)' },
              { field: 'packageBreadth', label: 'Breadth (cm)' },
              { field: 'packageHeight', label: 'Height (cm)' },
            ].map(({ field, label }) => (
              <div key={field}>
                <label className="label">{label} *</label>
                <input
                  type="number"
                  value={form[field as keyof typeof form]}
                  onChange={(e) => update(field, e.target.value)}
                  className="input"
                  placeholder="0"
                  min="0.1"
                  step="0.1"
                  required
                />
              </div>
            ))}
          </div>

          <div>
            <label className="label">Actual Weight (kg) *</label>
            <input
              type="number"
              value={form.actualWeight}
              onChange={(e) => update('actualWeight', e.target.value)}
              className="input"
              placeholder="0.0"
              min="0.1"
              step="0.1"
              required
            />
          </div>

          <hr className="border-purple-500/10" />
          <h2 className="text-lg font-semibold">🏷️ Order Type</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Order Type</label>
              <select value={form.orderType} onChange={(e) => update('orderType', e.target.value)} className="select">
                <option value="B2C">B2C (Business to Customer)</option>
                <option value="B2B">B2B (Business to Business)</option>
              </select>
            </div>
            <div>
              <label className="label">Payment Type</label>
              <select value={form.paymentType} onChange={(e) => update('paymentType', e.target.value)} className="select">
                <option value="PREPAID">Prepaid</option>
                <option value="COD">Cash on Delivery (COD)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="input"
              rows={2}
              placeholder="Special instructions for the agent..."
            />
          </div>

          <button
            onClick={getPreview}
            disabled={loading || !form.pickupAddress || !form.dropAddress || !form.packageLength || !form.actualWeight}
            className="btn-primary w-full justify-center py-3"
          >
            {loading ? '⏳ Calculating...' : '→ Get Charge Preview'}
          </button>
        </div>
      )}

      {/* Step 1: Charge Preview */}
      {step === 1 && preview && (
        <div className="animate-fade-in space-y-4">
          <div className="card-elevated">
            <h2 className="text-lg font-semibold mb-4">💰 Charge Breakdown</h2>

            {/* Zone info */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="text-center">
                <p className="text-xs text-slate-400">Pickup Zone</p>
                <p className="font-semibold text-purple-300">{preview.pickupZone.name}</p>
              </div>
              <div className="flex-1 h-px bg-gradient-to-r from-purple-500/50 to-blue-500/50 relative">
                <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                  {preview.charge.isIntraZone ? '↔ Intra-Zone' : '→ Inter-Zone'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400">Drop Zone</p>
                <p className="font-semibold text-blue-300">{preview.dropZone.name}</p>
              </div>
            </div>

            {/* Breakdown rows */}
            <div className="space-y-0">
              {[
                { label: 'Package (L×B×H)', value: `${form.packageLength}×${form.packageBreadth}×${form.packageHeight} cm` },
                { label: 'Actual Weight', value: `${form.actualWeight} kg` },
                { label: 'Volumetric Weight', value: `${preview.charge.volumetricWeight} kg`, note: '(L×B×H ÷ 5000)' },
                { label: 'Billed Weight', value: `${preview.charge.billedWeight} kg`, highlight: true, note: '(higher of actual vs volumetric)' },
                { label: 'Rate Card', value: preview.charge.rateCardName },
                { label: 'Base Rate', value: `₹${preview.charge.baseRate}/kg` },
                { label: 'Delivery Charge', value: formatCurrency(preview.charge.baseCharge) },
              ].map((row) => (
                <div key={row.label} className="charge-row">
                  <div>
                    <span className={row.highlight ? 'text-white font-medium' : 'text-slate-400'}>{row.label}</span>
                    {row.note && <span className="text-xs text-slate-600 ml-1">{row.note}</span>}
                  </div>
                  <span className={row.highlight ? 'text-purple-300 font-semibold' : 'text-slate-300'}>{row.value}</span>
                </div>
              ))}

              {preview.charge.codSurcharge > 0 && (
                <div className="charge-row">
                  <span className="text-orange-400">COD Surcharge</span>
                  <span className="text-orange-400">+ {formatCurrency(preview.charge.codSurcharge)}</span>
                </div>
              )}

              <div className="charge-row total mt-2 pt-3 border-t border-purple-500/30">
                <span className="gradient-text">Total Charge</span>
                <span className="text-2xl gradient-text">{formatCurrency(preview.charge.totalCharge)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="btn-secondary flex-1 justify-center">
              ← Edit Order
            </button>
            <button onClick={() => setStep(2)} className="btn-primary flex-1 justify-center">
              Confirm Details →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirm */}
      {step === 2 && preview && (
        <div className="card-elevated animate-fade-in space-y-4">
          <h2 className="text-lg font-semibold mb-4">✅ Confirm Your Order</h2>

          <div className="space-y-3 text-sm">
            {[
              { label: 'From', value: form.pickupAddress },
              { label: 'To', value: form.dropAddress },
              { label: 'Type', value: `${form.orderType} · ${form.paymentType}` },
              { label: 'Package', value: `${form.packageLength}×${form.packageBreadth}×${form.packageHeight} cm · ${form.actualWeight} kg` },
              { label: 'Total Charge', value: formatCurrency(preview.charge.totalCharge), large: true },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-start gap-4">
                <span className="text-slate-400 shrink-0">{row.label}</span>
                <span className={`text-right ${row.large ? 'text-xl font-bold gradient-text' : 'text-slate-200'}`}>{row.value}</span>
              </div>
            ))}
          </div>

          {form.paymentType === 'COD' && (
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm text-orange-300">
              💡 COD amount of {formatCurrency(preview.charge.totalCharge)} will be collected by the agent at delivery.
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1 justify-center">
              ← Back
            </button>
            <button onClick={confirmOrder} disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? '⏳ Placing Order...' : '🚀 Place Order'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
