'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { OrderType } from '@prisma/client'

interface Zone { id: string; name: string }
interface RateCard {
  id: string; name: string; orderType: OrderType; isIntraZone: boolean; isActive: boolean
  fromZone: { name: string } | null; toZone: { name: string } | null; intraZone: { name: string } | null
  baseRate: number; minCharge: number
}
interface CodSurcharge { orderType: OrderType; surchargeAmount: number }

const EMPTY_FORM = { name: '', orderType: 'B2C', isIntraZone: false, fromZoneId: '', toZoneId: '', intraZoneId: '', baseRate: '', minCharge: '' }

export default function RateCardManager({
  initialRateCards, zones, codSurcharges
}: { initialRateCards: RateCard[]; zones: Zone[]; codSurcharges: CodSurcharge[] }) {
  const [rateCards, setRateCards] = useState(initialRateCards)
  const [cods, setCods] = useState(codSurcharges)
  const [form, setForm] = useState(EMPTY_FORM)
  const [codForm, setCodForm] = useState({ B2C: cods.find(c => c.orderType === 'B2C')?.surchargeAmount || 0, B2B: cods.find(c => c.orderType === 'B2B')?.surchargeAmount || 0 })
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function createRateCard(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const body = {
        name: form.name,
        orderType: form.orderType as OrderType,
        isIntraZone: form.isIntraZone,
        fromZoneId: form.isIntraZone ? null : (form.fromZoneId || null),
        toZoneId: form.isIntraZone ? null : (form.toZoneId || null),
        intraZoneId: form.isIntraZone ? (form.intraZoneId || null) : null,
        baseRate: parseFloat(form.baseRate),
        minCharge: parseFloat(form.minCharge),
      }
      const res = await fetch('/api/rate-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      setRateCards(prev => [...prev, { ...data, fromZone: null, toZone: null, intraZone: null }])
      setForm(EMPTY_FORM)
      toast.success('Rate card created!')
    } catch { toast.error('Failed') } finally { setLoading(false) }
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/rate-cards/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !isActive }) })
    if (res.ok) {
      setRateCards(prev => prev.map(rc => rc.id === id ? { ...rc, isActive: !isActive } : rc))
      toast.success(isActive ? 'Rate card deactivated' : 'Rate card activated')
    }
  }

  async function deleteRateCard(id: string) {
    if (!confirm('Delete this rate card?')) return
    const res = await fetch(`/api/rate-cards/${id}`, { method: 'DELETE' })
    if (res.ok) { setRateCards(prev => prev.filter(rc => rc.id !== id)); toast.success('Deleted') }
  }

  async function saveCodSurcharge(orderType: 'B2C' | 'B2B') {
    const res = await fetch('/api/cod-surcharges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderType, surchargeAmount: codForm[orderType] }),
    })
    if (res.ok) toast.success(`COD surcharge for ${orderType} saved`)
    else toast.error('Failed to save')
  }

  return (
    <div className="space-y-8">
      {/* COD Surcharges */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">💵 COD Surcharges</h2>
        <div className="grid grid-cols-2 gap-4">
          {(['B2C', 'B2B'] as const).map(type => (
            <div key={type} className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
              <label className="label">{type} COD Surcharge (₹ flat fee)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={codForm[type]}
                  onChange={(e) => setCodForm(prev => ({ ...prev, [type]: parseFloat(e.target.value) }))}
                  className="input flex-1"
                  min="0"
                  step="1"
                />
                <button onClick={() => saveCodSurcharge(type)} className="btn-primary px-3 shrink-0">Save</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Existing Rate Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Rate Cards ({rateCards.length})</h2>
        <div className="card p-0 overflow-hidden">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Zone Scope</th>
                  <th>Base Rate</th>
                  <th>Min Charge</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rateCards.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-500">No rate cards yet</td></tr>
                ) : rateCards.map(rc => (
                  <tr key={rc.id}>
                    <td className="font-medium text-sm">{rc.name}</td>
                    <td>
                      <div className="text-xs">
                        <span className={rc.orderType === 'B2B' ? 'text-blue-400' : 'text-purple-400'}>{rc.orderType}</span>
                        <span className="text-slate-500 ml-1">· {rc.isIntraZone ? 'Intra' : 'Inter'}</span>
                      </div>
                    </td>
                    <td className="text-xs text-slate-400">
                      {rc.isIntraZone
                        ? rc.intraZone ? `Within ${rc.intraZone.name}` : 'All zones'
                        : rc.fromZone && rc.toZone ? `${rc.fromZone.name} ↔ ${rc.toZone.name}` : 'All corridors'
                      }
                    </td>
                    <td className="font-mono text-sm">₹{rc.baseRate}/kg</td>
                    <td className="font-mono text-sm">{formatCurrency(rc.minCharge)}</td>
                    <td>
                      <button onClick={() => toggleActive(rc.id, rc.isActive)} className={`text-xs px-2 py-1 rounded-full border ${rc.isActive ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-red-500/30 text-red-400 bg-red-500/10'}`}>
                        {rc.isActive ? '● Active' : '○ Inactive'}
                      </button>
                    </td>
                    <td>
                      <button onClick={() => deleteRateCard(rc.id)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Form */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-6">+ New Rate Card</h2>
        <form onSubmit={createRateCard} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Rate Card Name *</label>
              <input type="text" value={form.name} onChange={e => update('name', e.target.value)} className="input" placeholder="B2C Intra-Zone Standard" required />
            </div>
            <div>
              <label className="label">Order Type *</label>
              <select value={form.orderType} onChange={e => update('orderType', e.target.value)} className="select">
                <option value="B2C">B2C</option>
                <option value="B2B">B2B</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Zone Scope</label>
            <div className="grid grid-cols-2 gap-2">
              {[false, true].map(isIntra => (
                <button
                  key={String(isIntra)}
                  type="button"
                  onClick={() => update('isIntraZone', isIntra)}
                  className={`py-2 rounded-lg text-sm border transition-all ${form.isIntraZone === isIntra ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}
                >
                  {isIntra ? '🔄 Intra-Zone (same zone)' : '↔ Inter-Zone (different zones)'}
                </button>
              ))}
            </div>
          </div>

          {form.isIntraZone ? (
            <div>
              <label className="label">Specific Zone (leave blank for all zones)</label>
              <select value={form.intraZoneId} onChange={e => update('intraZoneId', e.target.value)} className="select">
                <option value="">All zones (generic)</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">From Zone (blank = any)</label>
                <select value={form.fromZoneId} onChange={e => update('fromZoneId', e.target.value)} className="select">
                  <option value="">Any zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">To Zone (blank = any)</label>
                <select value={form.toZoneId} onChange={e => update('toZoneId', e.target.value)} className="select">
                  <option value="">Any zone</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Base Rate (₹/kg) *</label>
              <input type="number" value={form.baseRate} onChange={e => update('baseRate', e.target.value)} className="input" placeholder="35" min="0.01" step="0.01" required />
            </div>
            <div>
              <label className="label">Minimum Charge (₹) *</label>
              <input type="number" value={form.minCharge} onChange={e => update('minCharge', e.target.value)} className="input" placeholder="50" min="0.01" step="0.01" required />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3">
            {loading ? '⏳ Creating...' : '+ Create Rate Card'}
          </button>
        </form>
      </div>
    </div>
  )
}
