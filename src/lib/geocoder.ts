/**
 * Geocoder using OpenStreetMap Nominatim API (free, no key required)
 * Rate limit: 1 request/second — acceptable for server-side use
 */

export interface GeocodedAddress {
  lat: number
  lng: number
  displayName: string
}

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  try {
    const encoded = encodeURIComponent(address)
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DeliveryTracker/1.0 (delivery-tracker-app)',
      },
    })

    if (!response.ok) {
      console.error('Geocoding failed:', response.statusText)
      return null
    }

    const data = await response.json()
    if (!data || data.length === 0) return null

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    }
  } catch (error) {
    console.error('Geocoder error:', error)
    return null
  }
}
