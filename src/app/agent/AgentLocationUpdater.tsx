'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AgentLocationUpdater() {
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const router = useRouter()

  async function updateLocation() {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/agents/location', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
          const data = await res.json()
          if (!res.ok) { toast.error(data.error); return }
          const zone = data.zone?.name || 'Outside zones'
          toast.success(`Location updated! Zone: ${zone}`)
          setLastUpdate(new Date().toLocaleTimeString('en-IN'))
          router.refresh()
        } catch { toast.error('Failed to update location') } finally { setLoading(false) }
      },
      (err) => {
        toast.error(`Location error: ${err.message}`)
        setLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }

  return (
    <div className="card mb-6 flex items-center justify-between">
      <div>
        <p className="font-semibold">📍 Location</p>
        <p className="text-sm text-slate-400">{lastUpdate ? `Updated at ${lastUpdate}` : 'Share your location to improve assignment accuracy'}</p>
      </div>
      <button onClick={updateLocation} disabled={loading} className="btn-primary py-2 px-4 text-sm shrink-0">
        {loading ? '📡 Getting...' : '📡 Update Location'}
      </button>
    </div>
  )
}
