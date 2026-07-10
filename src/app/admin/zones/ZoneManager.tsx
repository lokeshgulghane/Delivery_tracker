'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

interface Zone {
  id: string
  name: string
  geoJsonBoundary: { type: string; coordinates: number[][][] }
  areas: { id: string; name: string; pincode: string }[]
  _count: { pickupOrders: number }
}

export default function ZoneManager({ initialZones }: { initialZones: Zone[] }) {
  const [zones, setZones] = useState(initialZones)
  const [newZoneName, setNewZoneName] = useState('')
  const [loading, setLoading] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<unknown>(null)

  useEffect(() => {
    // Dynamically load Leaflet on client only
    const loadLeaflet = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      if (!mapRef.current || leafletMapRef.current) return

      const map = L.map(mapRef.current, {
        center: [19.076, 72.877], // Mumbai
        zoom: 11,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      // Draw existing zones in gold
      initialZones.forEach(zone => {
        const coords = zone.geoJsonBoundary.coordinates[0].map(
          (c: number[]) => [c[1], c[0]] as [number, number]
        )
        const polygon = L.polygon(coords, {
          color: '#D4A017',
          fillColor: '#D4A017',
          fillOpacity: 0.15,
          weight: 2,
        })
        polygon.bindTooltip(zone.name, { permanent: true, className: 'zone-label' })
        polygon.addTo(map)
      })

      // Click to draw rectangle zone
      let startLatLng: { lat: number; lng: number } | null = null
      let drawRect: unknown = null

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (!startLatLng) {
          startLatLng = e.latlng
          toast.info('Click a second point to complete the zone rectangle')
        } else {
          const bounds = [
            [Math.min(startLatLng.lat, e.latlng.lat), Math.min(startLatLng.lng, e.latlng.lng)],
            [Math.max(startLatLng.lat, e.latlng.lat), Math.max(startLatLng.lng, e.latlng.lng)],
          ]

          if (drawRect) (map as { removeLayer: (l: unknown) => void }).removeLayer(drawRect)

          const rect = L.rectangle(bounds as [[number, number], [number, number]], {
            color: '#F0C040',
            fillColor: '#F0C040',
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '6',
          })
          rect.addTo(map)
          drawRect = rect
          startLatLng = null

          // Store drawn bounds for zone creation
          ;(window as unknown as Record<string, unknown>).__pendingZoneBounds = bounds
          toast.success('Zone area drawn! Enter a name below and click "Save Zone"')
        }
      })

      leafletMapRef.current = map
      setMapReady(true)
    }

    loadLeaflet().catch(console.error)

    return () => {
      if (leafletMapRef.current) {
        ;(leafletMapRef.current as { remove: () => void }).remove()
        leafletMapRef.current = null
      }
    }
  }, [initialZones])

  async function saveZone() {
    const bounds = (window as unknown as Record<string, unknown>).__pendingZoneBounds as number[][]
    if (!bounds) { toast.error('Draw a zone on the map first'); return }
    if (!newZoneName.trim()) { toast.error('Enter a zone name'); return }

    setLoading(true)
    try {
      const [[lat1, lng1], [lat2, lng2]] = bounds
      const geoJsonBoundary = {
        type: 'Polygon',
        coordinates: [[
          [lng1, lat1],
          [lng2, lat1],
          [lng2, lat2],
          [lng1, lat2],
          [lng1, lat1],
        ]],
      }

      const res = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newZoneName.trim(), geoJsonBoundary }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }

      setZones(prev => [...prev, { ...data, areas: [], _count: { pickupOrders: 0 } }])
      setNewZoneName('')
      ;(window as unknown as Record<string, unknown>).__pendingZoneBounds = null
      toast.success(`Zone "${newZoneName}" created!`)
    } catch { toast.error('Failed to create zone') } finally { setLoading(false) }
  }

  async function deleteZone(id: string) {
    if (!confirm('Delete this zone? This will affect rate cards referencing it.')) return
    const res = await fetch(`/api/zones/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setZones(prev => prev.filter(z => z.id !== id))
      toast.success('Zone deleted')
    } else {
      toast.error('Failed to delete zone')
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Map */}
      <div className="md:col-span-2">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-gold-border">
            <h2 className="font-semibold">Zone Map</h2>
            <p className="text-xs text-gold-muted mt-1">Click two points on the map to draw a zone rectangle. Existing zones shown in gold.</p>
          </div>
          <div ref={mapRef} style={{ height: '500px' }} className="w-full" />
        </div>

        {/* Save Zone */}
        <div className="card mt-4 flex gap-3">
          <input
            type="text"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="Zone name (e.g. Mumbai North)"
            className="input flex-1"
          />
          <button onClick={saveZone} disabled={loading} className="btn-primary px-4 shrink-0">
            {loading ? '⏳' : '+ Save Zone'}
          </button>
        </div>
      </div>

      {/* Zone List */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Configured Zones ({zones.length})</h2>
        <div className="space-y-3">
          {zones.length === 0 ? (
            <div className="card text-center py-8 text-gold-muted">
              <p>No zones yet.</p>
              <p className="text-xs mt-1">Draw on the map to create your first zone.</p>
            </div>
          ) : zones.map(zone => (
            <div key={zone.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gold-primary">{zone.name}</p>
                  <p className="text-xs text-gold-muted mt-1">{zone._count.pickupOrders} orders</p>
                  <p className="text-xs text-gold-muted">{zone.areas.length} areas</p>
                </div>
                <button
                  onClick={() => deleteZone(zone.id)}
                  className="text-red-400 hover:text-red-300 text-xs p-1"
                >
                  ✕
                </button>
              </div>
              {zone.areas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {zone.areas.slice(0, 4).map(a => (
                    <span key={a.id} className="text-xs px-2 py-0.5 rounded-full bg-gold-subtle border border-gold-border text-gold-primary">
                      {a.name}
                    </span>
                  ))}
                  {zone.areas.length > 4 && <span className="text-xs text-gold-muted">+{zone.areas.length - 4} more</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
