'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { OrderType } from '@prisma/client'

interface CodSurcharge { orderType: OrderType; surchargeAmount: number }

export default function CodSurchargeManager({ initialSurcharges }: { initialSurcharges: CodSurcharge[] }) {
  const [amounts, setAmounts] = useState<Record<string, number>>({
    B2C: initialSurcharges.find(s => s.orderType === 'B2C')?.surchargeAmount ?? 30,
    B2B: initialSurcharges.find(s => s.orderType === 'B2B')?.surchargeAmount ?? 50,
  })
  const [saving, setSaving] = useState<string | null>(null)

  async function save(orderType: 'B2C' | 'B2B') {
    setSaving(orderType)
    try {
      const res = await fetch('/api/cod-surcharges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType, surchargeAmount: amounts[orderType] }),
      })
      if (res.ok) toast.success(`${orderType} COD surcharge updated to ₹${amounts[orderType]}`)
      else toast.error('Failed to save')
    } catch { toast.error('Error saving') } finally { setSaving(null) }
  }

  return (
    <div className="space-y-6">
      {(['B2C', 'B2B'] as const).map(type => (
        <div key={type} className="card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold gradient-text">{type} Orders</h2>
              <p className="text-sm text-gold-muted mt-0.5">
                {type === 'B2C'
                  ? 'Business-to-consumer deliveries (individual customers)'
                  : 'Business-to-business deliveries (corporate accounts)'}
              </p>
            </div>
            <span className="text-3xl font-bold gradient-text">₹{amounts[type]}</span>
          </div>

          <div className="mt-4">
            <label className="label">COD Surcharge Amount (₹ flat fee per order)</label>
            <div className="flex gap-3">
              <input
                type="number"
                value={amounts[type]}
                onChange={e => setAmounts(prev => ({ ...prev, [type]: parseFloat(e.target.value) || 0 }))}
                className="input flex-1"
                min="0"
                step="1"
              />
              <button
                onClick={() => save(type)}
                disabled={saving === type}
                className="btn-primary px-6 shrink-0"
              >
                {saving === type ? '⏳' : '✓ Save'}
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg text-xs text-gold-muted" style={{ background: 'rgba(212,160,23,0.05)', border: '1px solid rgba(212,160,23,0.1)' }}>
            💡 This flat fee is added on top of the base shipping charge when the customer selects COD as the payment method.
          </div>
        </div>
      ))}

      <div className="card" style={{ background: 'rgba(212,160,23,0.04)' }}>
        <h3 className="font-semibold mb-3">How COD Pricing Works</h3>
        <div className="space-y-2 text-sm text-gold-muted">
          <p>1. Customer places an order with <strong className="text-gold-primary">COD</strong> payment type</p>
          <p>2. System calculates the base shipping charge from the rate card</p>
          <p>3. The COD surcharge configured here is <strong className="text-gold-primary">added on top</strong></p>
          <p>4. Agent collects the total amount (base + COD) upon delivery</p>
        </div>
      </div>
    </div>
  )
}
